#!/usr/bin/env python3
"""
tools/import_v2.py
URL 指定 → パース → 重複チェック → data/v2/tags.json へ追加 → compile

使い方:
  # 単一 URL
  python3 tools/import_v2.py https://sorenuts.jp/1954/

  # 複数 URL（スペース区切り）
  python3 tools/import_v2.py https://sorenuts.jp/1954/ https://sorenuts.jp/4566/

  # 全 sorenuts ページを一括取り込み
  python3 tools/import_v2.py --all-sorenuts

  # ドライラン（v2/tags.json を変更しない）
  python3 tools/import_v2.py --dry-run https://sorenuts.jp/1954/

オプション:
  --dry-run         JSON を更新せず統計だけ表示
  --force           重複でも上書き（jp を更新）
  --all-sorenuts    全 sorenuts.jp 対象ページを一括処理
  --delay N         ページ間の待機秒数（デフォルト 2）
  --from-html FILE  URL の代わりにローカル HTML ファイルを使用（URL は必須引数として指定）
"""

from __future__ import annotations
import sys
import json
import time
import argparse
import datetime
from pathlib import Path

# プロジェクトルート配下の tools/ を sys.path に追加
_ROOT = Path(__file__).parent.parent
_TOOLS = Path(__file__).parent
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from parsers.base import get_parser, ParseResult, Section, Tag

# ---------------------------------------------------------------------------
# パス定数
# ---------------------------------------------------------------------------

V2_SRC   = _ROOT / "data/v2/tags.json"
V2_OUT   = _ROOT / "data/v2/compiled/tags.json"
COMPILE  = _ROOT / "tools/compile_v2.py"

# ---------------------------------------------------------------------------
# sorenuts.jp 全対象 URL
# ---------------------------------------------------------------------------

SORENUTS_URLS = [
    "https://sorenuts.jp/1954/",   # 表情・目の形
    "https://sorenuts.jp/4566/",   # ポーズ・体の特徴
    "https://sorenuts.jp/4580/",   # 服装
    "https://sorenuts.jp/2420/",   # 環境・背景・場所
    "https://sorenuts.jp/2908/",   # カメラ・構図
    "https://sorenuts.jp/6667/",   # 髪型
    "https://sorenuts.jp/4507/",   # 動作・行動
    "https://sorenuts.jp/2187/",   # 職業・種族
    "https://sorenuts.jp/3602/",   # 画風
]

# ---------------------------------------------------------------------------
# memone-ro.com 全対象 URL（104ページ）
# ---------------------------------------------------------------------------

def _get_memone_urls() -> list[str]:
    """parsers.memone_ro から URL リストを遅延取得する。"""
    import importlib
    mod = importlib.import_module("parsers.memone_ro")
    return mod.ALL_URLS

MEMONE_RO_URLS: list[str] = []  # 実行時に _get_memone_urls() で取得

# ---------------------------------------------------------------------------
# v2 JSON 操作ヘルパー
# ---------------------------------------------------------------------------

def load_v2() -> dict:
    with open(V2_SRC, encoding="utf-8") as f:
        return json.load(f)


def save_v2(data: dict) -> None:
    with open(V2_SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _iter_sections(cat: dict):
    """カテゴリから全セクションをイテレートする（4階層/3階層両対応）。"""
    if "subcategories" in cat:
        for sc in cat["subcategories"]:
            yield from sc.get("sections", [])
    else:
        yield from cat.get("sections", [])


def v2_en_set(data: dict) -> set[str]:
    """v2 JSON 内の全 en 値（lowercase）をセットで返す。"""
    result = set()
    for cat in data.get("categories", []):
        for sec in _iter_sections(cat):
            for tag in sec.get("tags", []):
                result.add(tag["en"].lower().strip())
    return result


def find_or_create_category(data: dict, cat_id: str, cat_label: str) -> dict:
    """data['categories'] から cat_id のカテゴリを探す。なければ末尾に追加。"""
    for cat in data["categories"]:
        if cat["id"] == cat_id:
            return cat
    # 新規カテゴリ（4階層: 既存カテゴリと同形式に合わせる）
    if data["categories"] and "subcategories" in data["categories"][0]:
        new_cat = {
            "id": cat_id,
            "label": cat_label,
            "subcategories": [{"id": f"{cat_id}_general", "label": "全般", "sections": []}],
        }
    else:
        new_cat = {"id": cat_id, "label": cat_label, "sections": []}
    data["categories"].append(new_cat)
    return new_cat


def find_or_create_section(cat_dict: dict, sec_id: str, sec_label: str) -> dict:
    """カテゴリ内の sec_id セクションを探す。なければ最後のサブカテゴリに追加。"""
    for sec in _iter_sections(cat_dict):
        if sec["id"] == sec_id:
            return sec
    new_sec = {"id": sec_id, "label": sec_label, "tags": []}
    # 4階層: 最後のサブカテゴリに追加
    if "subcategories" in cat_dict:
        cat_dict["subcategories"][-1]["sections"].append(new_sec)
    else:
        cat_dict.setdefault("sections", []).append(new_sec)
    return new_sec


# ---------------------------------------------------------------------------
# 重複チェック付きマージ
# ---------------------------------------------------------------------------

class ImportStats:
    def __init__(self):
        self.added   = 0
        self.skipped = 0
        self.updated = 0
        self.sections_created = 0

    def report(self):
        print(f"  added={self.added}  skipped(dup)={self.skipped}  "
              f"updated(jp)={self.updated}  new_sections={self.sections_created}")


def merge_result(
    data: dict,
    result: ParseResult,
    dry_run: bool = False,
    force: bool = False,
) -> ImportStats:
    """
    ParseResult を v2 JSON にマージする。
    - dry_run: JSON を変更しない
    - force  : 同 en が存在する場合も jp を更新
    """
    stats = ImportStats()
    existing_en = v2_en_set(data)

    cat_dict = find_or_create_category(data, result.category_id, result.category_label)

    # source_url / source_site / imported_at をカテゴリに付与
    now = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    cat_dict.setdefault("source_url", result.source_url)
    cat_dict.setdefault("source_site", result.source_site)
    cat_dict["imported_at"] = now

    for sec in result.sections:
        sec_existed = any(s["id"] == sec.id for s in cat_dict.get("sections", []))
        sec_dict = find_or_create_section(cat_dict, sec.id, sec.label)
        if not sec_existed:
            stats.sections_created += 1

        for tag in sec.tags:
            en_key = tag.en.lower().strip()
            if en_key in existing_en:
                if force:
                    # jp のみ更新（en は変えない）
                    for existing_tag in sec_dict["tags"]:
                        if existing_tag["en"].lower().strip() == en_key:
                            old_jp = existing_tag.get("jp", "")
                            if old_jp != tag.jp:
                                if not dry_run:
                                    existing_tag["jp"] = tag.jp
                                stats.updated += 1
                            break
                else:
                    stats.skipped += 1
                continue

            # 新規追加
            if not dry_run:
                sec_dict["tags"].append(tag.to_dict())
            existing_en.add(en_key)
            stats.added += 1

    # count 更新
    if not dry_run:
        data["count"] = sum(
            len(sec["tags"])
            for cat in data["categories"]
            for sec in _iter_sections(cat)
        )

    return stats


# ---------------------------------------------------------------------------
# compile_v2 実行
# ---------------------------------------------------------------------------

def run_compile():
    import subprocess
    result = subprocess.run(
        [sys.executable, str(COMPILE)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [compile] ERROR:\n{result.stderr}")
    else:
        for line in result.stdout.strip().splitlines():
            print(f"  [compile] {line}")


# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------

def import_url(
    url: str,
    data: dict,
    dry_run: bool,
    force: bool,
    from_html: str | None = None,
) -> ImportStats | None:
    """1 URL をインポートする。失敗時は None を返す。"""
    print(f"\n{'='*60}")
    print(f"URL: {url}")
    try:
        parser = get_parser(url)
        print(f"Parser: {parser.site_name}")
        if from_html:
            html_path = Path(from_html)
            if not html_path.exists():
                raise FileNotFoundError(f"HTML file not found: {from_html}")
            html = html_path.read_text(encoding="utf-8", errors="replace")
            print(f"  (HTML from local file: {from_html})")
            result = parser.parse(html, url)
        else:
            result = parser.run(url)
    except Exception as exc:
        print(f"  [ERROR] {exc}")
        return None

    print(f"  Parsed: {result.category_label} ({result.category_id})")
    print(f"  Sections: {len(result.sections)}, Tags: {result.tag_count}")
    for sec in result.sections:
        print(f"    [{sec.id}] {sec.label}: {len(sec.tags)} tags")

    stats = merge_result(data, result, dry_run=dry_run, force=force)
    stats.report()
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="v2 JSON へ URL からタグをインポートする",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("urls", nargs="*", help="インポート対象 URL")
    parser.add_argument("--all-sorenuts", action="store_true",
                        help="全 sorenuts.jp 対象ページを処理")
    parser.add_argument("--all-memone", action="store_true",
                        help="全 memone-ro.com 対象ページを処理（104ページ）")
    parser.add_argument("--dry-run", action="store_true",
                        help="JSON を変更せず統計のみ表示")
    parser.add_argument("--force", action="store_true",
                        help="重複 en の jp を強制更新")
    parser.add_argument("--delay", type=float, default=2.0,
                        help="ページ間の待機秒数（デフォルト 2）")
    parser.add_argument("--from-html", metavar="FILE",
                        help="URL の代わりにローカル HTML ファイルを使用")
    args = parser.parse_args()

    urls = list(args.urls)
    if args.all_sorenuts:
        urls = SORENUTS_URLS + [u for u in urls if u not in SORENUTS_URLS]
    if args.all_memone:
        memone_urls = _get_memone_urls()
        existing = set(urls)
        urls = urls + [u for u in memone_urls if u not in existing]

    if not urls:
        parser.print_help()
        sys.exit(1)

    if args.dry_run:
        print("[DRY RUN] v2/tags.json は変更しません")

    data = load_v2()
    print(f"v2 現在: {data['count']} tags / {len(data['categories'])} categories")

    total_added = total_skipped = total_updated = total_new_sec = 0
    success = 0

    for i, url in enumerate(urls):
        if i > 0:
            time.sleep(args.delay)
        stats = import_url(url, data, dry_run=args.dry_run, force=args.force,
                           from_html=args.from_html)
        if stats is not None:
            total_added   += stats.added
            total_skipped += stats.skipped
            total_updated += stats.updated
            total_new_sec += stats.sections_created
            success += 1

    print(f"\n{'='*60}")
    print("完了サマリー")
    print(f"  処理: {success}/{len(urls)} URLs")
    print(f"  追加: {total_added} tags")
    print(f"  重複スキップ: {total_skipped} tags")
    print(f"  jp 更新: {total_updated} tags")
    print(f"  新規セクション: {total_new_sec}")

    if not args.dry_run and total_added > 0:
        save_v2(data)
        print(f"\nSaved: {V2_SRC}")
        print("Compiling …")
        run_compile()
    elif args.dry_run:
        print("\n[DRY RUN] 変更は保存されていません")
    else:
        print("\n新規タグなし。保存をスキップ。")


if __name__ == "__main__":
    main()
