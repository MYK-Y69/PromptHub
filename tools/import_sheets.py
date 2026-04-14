#!/usr/bin/env python3
"""
tools/import_sheets.py
Google スプレッドシート（CSV 公開）から v2 JSON にタグを追加する。

使い方:
  python3 tools/import_sheets.py
  python3 tools/import_sheets.py --dry-run
  python3 tools/import_sheets.py --force      # 重複 en の jp を上書き

スプレッドシートのカラム（1行目はヘッダー行として自動スキップ）:
  en | jp | category | subcategory | section | target | target_note

  category / subcategory は ID（例: pose）または日本語ラベル（例: ポーズ）で入力可。
  section はラベル（日本語可）。存在しなければ自動作成。

設定ファイル: data/v2/sheets_config.json
  {"csv_url": "https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0"}
"""

from __future__ import annotations
import sys
import csv
import json
import ssl
import re
import datetime
import argparse
from io import StringIO
from pathlib import Path

import urllib.request

ROOT      = Path(__file__).parent.parent
V2_SRC    = ROOT / "data/v2/tags.json"
CONFIG    = ROOT / "data/v2/sheets_config.json"
LOG_FILE  = ROOT / "data/v2/sheets_import_log.jsonl"
COMPILE   = ROOT / "tools/compile_v2.py"

# ---------------------------------------------------------------------------
# 設定読み込み
# ---------------------------------------------------------------------------

def load_config() -> dict:
    if not CONFIG.exists():
        raise FileNotFoundError(f"設定ファイルが見つかりません: {CONFIG}")
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    url = cfg.get("csv_url", "").strip()
    if not url:
        print("エラー: sheets_config.json の csv_url が空です。")
        print(f"  スプレッドシートをウェブに公開して CSV の URL を設定してください:")
        print(f'  "csv_url": "https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0"')
        sys.exit(1)
    return cfg


# ---------------------------------------------------------------------------
# CSV 取得
# ---------------------------------------------------------------------------

def fetch_csv(url: str) -> str:
    ctx = ssl._create_unverified_context()
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            raw     = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
    except Exception as exc:
        raise RuntimeError(f"CSV 取得失敗: {exc}") from exc


# ---------------------------------------------------------------------------
# slugify
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "_", s)
    return s.strip("_") or "section"


# ---------------------------------------------------------------------------
# v2 JSON ヘルパー
# ---------------------------------------------------------------------------

def iter_sections(cat: dict):
    if "subcategories" in cat:
        for sc in cat["subcategories"]:
            yield from sc.get("sections", [])
    else:
        yield from cat.get("sections", [])


def build_en_set(data: dict) -> set[str]:
    result = set()
    for cat in data["categories"]:
        for sec in iter_sections(cat):
            for tag in sec["tags"]:
                result.add(tag["en"].lower().strip())
    return result


def resolve_category(data: dict, value: str) -> dict | None:
    """カテゴリを ID または日本語ラベルで検索する。"""
    v = value.strip()
    if not v:
        return None
    # 1) ID 完全一致
    for cat in data["categories"]:
        if cat["id"] == v:
            return cat
    # 2) ラベル完全一致（大文字小文字・前後空白無視）
    v_lower = v.lower()
    for cat in data["categories"]:
        if cat.get("label", "").strip().lower() == v_lower:
            return cat
    return None


def resolve_subcategory(cat: dict, value: str) -> dict | None:
    """サブカテゴリを ID または日本語ラベルで検索する。"""
    v = value.strip()
    if not v:
        return None
    v_lower = v.lower()
    for sc in cat.get("subcategories", []):
        if sc["id"] == v or sc.get("label", "").strip().lower() == v_lower:
            return sc
    return None


def _cat_list_str(data: dict) -> str:
    """利用可能なカテゴリ一覧を文字列で返す（エラー時の案内用）。"""
    return ", ".join(f"{c['id']}({c['label']})" for c in data["categories"])


def find_or_create_section_in_sc(sc: dict, sec_label: str) -> dict:
    """サブカテゴリ内でラベルが一致するセクションを探す。なければ作成。"""
    for sec in sc.get("sections", []):
        if sec["label"] == sec_label:
            return sec
    new_id = "ss_" + slugify(sec_label)
    # ID 衝突回避
    existing_ids = {s["id"] for s in sc.get("sections", [])}
    if new_id in existing_ids:
        new_id = new_id + "_" + str(len(existing_ids))
    new_sec = {"id": new_id, "label": sec_label, "tags": []}
    sc.setdefault("sections", []).append(new_sec)
    return new_sec


def recalc_count(data: dict) -> int:
    total = sum(
        len(sec["tags"])
        for cat in data["categories"]
        for sec in iter_sections(cat)
    )
    data["count"] = total
    return total


# ---------------------------------------------------------------------------
# インポートロジック
# ---------------------------------------------------------------------------

def process_row(
    row: dict,
    data: dict,
    en_set: set[str],
    dry_run: bool,
    force: bool,
    log_entries: list,
) -> str:
    """1行処理。'added' / 'updated' / 'skipped' / 'error' を返す。"""

    now = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    en  = row.get("en", "").strip()
    jp  = row.get("jp", "").strip()
    cat_raw = row.get("category", "").strip()
    sc_raw  = row.get("subcategory", "").strip()
    sec_lbl = row.get("section", "").strip()
    target  = row.get("target", "").strip() or None
    target_note = row.get("target_note", "").strip() or None

    if not en or not jp:
        log_entries.append({"ts": now, "en": en, "status": "error", "reason": "en/jp が空"})
        return "error"
    if not cat_raw:
        log_entries.append({"ts": now, "en": en, "status": "error", "reason": "category が空"})
        return "error"

    en_key = en.lower().strip()

    # 重複チェック
    if en_key in en_set:
        if force:
            for cat in data["categories"]:
                for sec in iter_sections(cat):
                    for tag in sec["tags"]:
                        if tag["en"].lower().strip() == en_key:
                            old_jp = tag.get("jp", "")
                            if old_jp != jp and not dry_run:
                                tag["jp"] = jp
                            log_entries.append({
                                "ts": now, "en": en, "status": "updated",
                                "old_jp": old_jp, "new_jp": jp
                            })
                            return "updated"
        log_entries.append({"ts": now, "en": en, "status": "skipped", "reason": "重複"})
        return "skipped"

    # ── カテゴリ解決（ID または日本語ラベル） ──────────────────────────────
    cat = resolve_category(data, cat_raw)
    if cat is None:
        avail = _cat_list_str(data)
        log_entries.append({"ts": now, "en": en, "status": "error",
                            "reason": f"カテゴリ '{cat_raw}' が見つかりません"})
        print(f"  [ERROR] category '{cat_raw}' が見つかりません")
        print(f"          利用可能: {avail}")
        return "error"
    if cat["id"] != cat_raw:
        print(f"  [INFO] category '{cat_raw}' → '{cat['id']}' ({cat['label']})")

    # ── サブカテゴリ解決（ID または日本語ラベル） ──────────────────────────
    if sc_raw:
        sc = resolve_subcategory(cat, sc_raw)
        if sc is None:
            # 指定値が見つからなければ最後のサブカテゴリにフォールバック
            sc = cat["subcategories"][-1] if cat.get("subcategories") else None
            avail_sc = ", ".join(
                f"{s['id']}({s['label']})" for s in cat.get("subcategories", [])
            )
            print(f"  [WARN] subcategory '{sc_raw}' が見つかりません"
                  f" → '{sc['id']}' に追加します")
            print(f"         利用可能: {avail_sc}")
        elif sc["id"] != sc_raw:
            print(f"  [INFO] subcategory '{sc_raw}' → '{sc['id']}' ({sc['label']})")
    else:
        sc = cat["subcategories"][-1] if cat.get("subcategories") else None

    if sc is None:
        log_entries.append({"ts": now, "en": en, "status": "error",
                            "reason": "サブカテゴリを解決できません"})
        return "error"

    # ── セクション解決（ラベル一致 or 新規作成） ──────────────────────────
    if not sec_lbl:
        sec_lbl = "スプレッドシート取り込み"
    sec = find_or_create_section_in_sc(sc, sec_lbl)

    # ── タグ追加 ────────────────────────────────────────────────────────────
    new_tag = {
        "en": en,
        "jp": jp,
        "target": target,
        "target_note": target_note,
    }

    if not dry_run:
        sec["tags"].append(new_tag)
        en_set.add(en_key)

    log_entries.append({
        "ts": now, "en": en, "jp": jp,
        "category": cat["id"], "subcategory": sc["id"], "section": sec["id"],
        "status": "added",
    })
    return "added"


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="スプレッドシート CSV → v2 JSON")
    parser.add_argument("--dry-run", action="store_true", help="JSON を変更しない")
    parser.add_argument("--force",   action="store_true", help="重複 en の jp を上書き")
    parser.add_argument("--deploy",  action="store_true", help="取り込み後に git commit & push する")
    args = parser.parse_args()

    cfg = load_config()
    print(f"CSV URL: {cfg['csv_url'][:80]}...")

    print("CSV を取得中...")
    csv_text = fetch_csv(cfg["csv_url"])

    reader = csv.DictReader(StringIO(csv_text))
    # ヘッダーの空白を除去（スプレッドシートで列名に空白が入る場合の対策）
    if reader.fieldnames:
        reader.fieldnames = [f.strip() for f in reader.fieldnames]
    rows = list(reader)
    print(f"取得行数: {len(rows)} 行（ヘッダー除く）")

    with open(V2_SRC, encoding="utf-8") as f:
        data = json.load(f)
    print(f"現在: {data['count']} tags")

    en_set = build_en_set(data)

    if args.dry_run:
        print("[DRY RUN] v2/tags.json は変更しません")

    stats = {"added": 0, "updated": 0, "skipped": 0, "error": 0}
    log_entries: list = []

    for i, row in enumerate(rows, 1):
        en = row.get("en", "").strip()
        if not en:
            continue  # 空行スキップ
        status = process_row(row, data, en_set, args.dry_run, args.force, log_entries)
        stats[status] = stats.get(status, 0) + 1

    # 結果表示
    print()
    print("=" * 50)
    print(f"  追加     : {stats['added']}")
    print(f"  更新(jp) : {stats['updated']}")
    print(f"  スキップ : {stats['skipped']}")
    print(f"  エラー   : {stats['error']}")
    print("=" * 50)

    if not args.dry_run and (stats["added"] > 0 or stats["updated"] > 0):
        recalc_count(data)
        with open(V2_SRC, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved: {V2_SRC}  ({data['count']} tags)")

        # コンパイル
        import subprocess
        result = subprocess.run(
            [sys.executable, str(COMPILE)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"[compile] ERROR:\n{result.stderr}")
        else:
            for line in result.stdout.strip().splitlines():
                print(f"[compile] {line}")

        # ログ追記
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            for entry in log_entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"ログ: {LOG_FILE}")
    elif args.dry_run:
        print("[DRY RUN] 変更は保存されていません")
    else:
        print("新規タグなし。保存をスキップ。")

    # 取り込み済みログ一覧（直近10件）
    if log_entries:
        print()
        print("取り込みログ（今回）:")
        added = [e for e in log_entries if e["status"] == "added"]
        for e in added[:20]:
            print(f"  [added] {e['en']:30s} → {e.get('category','?')}/{e.get('subcategory','?')}/{e.get('section','?')}")
        if len(added) > 20:
            print(f"  ... 他 {len(added)-20} 件")

    # --deploy: git commit & push
    if args.deploy and not args.dry_run and (stats["added"] > 0 or stats["updated"] > 0):
        n_added   = stats["added"]
        n_updated = stats["updated"]
        new_total = data["count"]

        # コミットメッセージ生成
        if n_added > 0 and n_updated > 0:
            msg_body = f"feat(sheets): {n_added} タグ追加 / {n_updated} タグ更新 (total {new_total})"
        elif n_added > 0:
            msg_body = f"feat(sheets): {n_added} タグ追加 (total {new_total})"
        else:
            msg_body = f"feat(sheets): {n_updated} タグ更新 (total {new_total})"

        commit_msg = f"{msg_body}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

        print()
        print("=" * 50)
        print("  --deploy: git commit & push を実行します")
        print("=" * 50)

        # git add
        ga = subprocess.run(
            ["git", "add", str(V2_SRC), str(V2_SRC.parent / "compiled" / "tags.json")],
            capture_output=True, text=True
        )
        if ga.returncode != 0:
            print(f"[deploy] git add ERROR:\n{ga.stderr}")
            sys.exit(1)

        # git commit
        gc = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            capture_output=True, text=True
        )
        if gc.returncode != 0:
            print(f"[deploy] git commit ERROR:\n{gc.stderr}")
            sys.exit(1)
        commit_hash = gc.stdout.strip().splitlines()[0] if gc.stdout else ""
        print(f"[deploy] commit: {commit_hash}")

        # git pull --rebase（競合防止）
        gp = subprocess.run(
            ["git", "pull", "--rebase", "origin", "main"],
            capture_output=True, text=True
        )
        if gp.returncode != 0:
            print(f"[deploy] git pull --rebase ERROR:\n{gp.stderr}")
            sys.exit(1)

        # git push
        gpush = subprocess.run(
            ["git", "push", "origin", "main"],
            capture_output=True, text=True
        )
        if gpush.returncode != 0:
            print(f"[deploy] git push ERROR:\n{gpush.stderr}")
            sys.exit(1)

        print(f"[deploy] push: ✅ origin/main")
        print()
        print("━" * 50)
        print("  deploy 完了")
        print("━" * 50)
        print(f"  tags    : {new_total}")
        print(f"  push    : ✅ origin/main")
        print("━" * 50)
        print("Actions 完了後（約1分）にリロードで最新が表示されます。")
    elif args.deploy and not args.dry_run:
        print("[deploy] 追加・更新がなかったため push をスキップしました。")


if __name__ == "__main__":
    main()
