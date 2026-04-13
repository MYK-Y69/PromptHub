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


def find_category(data: dict, cat_id: str):
    for cat in data["categories"]:
        if cat["id"] == cat_id:
            return cat
    return None


def find_subcategory(cat: dict, sc_id: str):
    for sc in cat.get("subcategories", []):
        if sc["id"] == sc_id:
            return sc
    return None


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
    cat_id  = row.get("category", "").strip()
    sc_id   = row.get("subcategory", "").strip()
    sec_lbl = row.get("section", "").strip()
    target  = row.get("target", "").strip() or None
    target_note = row.get("target_note", "").strip() or None

    if not en or not jp:
        log_entries.append({"ts": now, "en": en, "status": "error", "reason": "en/jp が空"})
        return "error"
    if not cat_id:
        log_entries.append({"ts": now, "en": en, "status": "error", "reason": "category が空"})
        return "error"

    en_key = en.lower().strip()

    # 重複チェック
    if en_key in en_set:
        if force:
            # jp を上書き（既存セクションを検索して更新）
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

    # カテゴリ確認
    cat = find_category(data, cat_id)
    if cat is None:
        log_entries.append({"ts": now, "en": en, "status": "error",
                            "reason": f"カテゴリ '{cat_id}' が見つかりません"})
        return "error"

    # サブカテゴリ確認
    if sc_id:
        sc = find_subcategory(cat, sc_id)
        if sc is None:
            # 指定サブカテゴリが存在しない → 最後のサブカテゴリに追加してwarn
            sc = cat["subcategories"][-1] if cat.get("subcategories") else None
            print(f"  [WARN] subcategory '{sc_id}' not found in '{cat_id}'"
                  f" → '{sc['id']}' に追加します")
    else:
        # サブカテゴリ未指定: 最後のサブカテゴリ（通常 *_other or *_misc）
        sc = cat["subcategories"][-1] if cat.get("subcategories") else None

    if sc is None:
        log_entries.append({"ts": now, "en": en, "status": "error",
                            "reason": f"サブカテゴリを解決できません"})
        return "error"

    # セクション確認・作成
    if not sec_lbl:
        sec_lbl = "スプレッドシート取り込み"
    sec = find_or_create_section_in_sc(sc, sec_lbl)

    # タグ追加
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
        "category": cat_id, "subcategory": sc["id"], "section": sec["id"],
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


if __name__ == "__main__":
    main()
