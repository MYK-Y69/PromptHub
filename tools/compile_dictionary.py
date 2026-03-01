#!/usr/bin/env python3
"""
compile_dictionary.py - Merge categories/*.json → compiled/safe.json + compiled/full.json

SAFE = *_r18.json を除外
FULL = 全カテゴリを含む

Fail-fast: 同一 id が複数カテゴリに存在した場合は例外で終了

出力:
  data/dictionary/compiled/safe.json    ← SAFE版
  data/dictionary/compiled/full.json    ← FULL版
  data/dictionary/expression.json       ← SAFE版（現UI後方互換）

Usage:
  python3 tools/compile_dictionary.py
"""
from __future__ import annotations

import sys
import json
import datetime
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent
CATEGORIES_DIR = REPO_DIR / "data" / "dictionary" / "categories"
COMPILED_DIR = REPO_DIR / "data" / "dictionary" / "compiled"
EXPRESSION_JSON = REPO_DIR / "data" / "dictionary" / "expression.json"


def load_categories(exclude_r18: bool) -> list[dict]:
    """
    categories/*.json を読み込み、items を結合して返す。
    同一 id が衝突した場合は ValueError で fail-fast。
    """
    files = sorted(CATEGORIES_DIR.glob("*.json"))
    if exclude_r18:
        files = [f for f in files if not f.stem.endswith("_r18")]

    all_items: list[dict] = []
    seen_ids: dict[str, str] = {}  # id → ファイル名

    for path in files:
        with open(path, encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                raise ValueError(f"JSON parse error in {path.name}: {e}") from e

        items = data.get("items", [])
        if not isinstance(items, list):
            raise ValueError(f"'items' must be a list in {path.name}")

        for item in items:
            item_id = item.get("id", "").strip()
            if not item_id:
                raise ValueError(f"Item without 'id' in {path.name}: {item}")
            if item_id in seen_ids:
                raise ValueError(
                    f"Duplicate id '{item_id}': "
                    f"found in '{path.name}' and '{seen_ids[item_id]}'"
                )
            seen_ids[item_id] = path.name
            all_items.append(item)

    return sorted(all_items, key=lambda x: x["id"].lower())


def build_categories_out(exclude_r18: bool) -> list[dict]:
    """
    カテゴリ別の正規化リスト [{key, label, items}, ...] を返す。
    items が空のカテゴリは除外。items はカテゴリ内で id ソート済み。
    label は各 JSON の label フィールド優先、なければ Title Case。
    """
    files = sorted(CATEGORIES_DIR.glob("*.json"))
    if exclude_r18:
        files = [f for f in files if not f.stem.endswith("_r18")]

    result = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", [])
        if not items:
            continue
        key = path.stem
        label = data.get("label") or key.replace("_", " ").title()
        result.append({
            "key": key,
            "label": label,
            "items": sorted(items, key=lambda x: x["id"].lower()),
        })
    return result


def write_compiled(path: Path, items: list[dict], categories_out: list[dict]) -> None:
    """compiled/safe.json または compiled/full.json を書き出す。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
        "categories": categories_out,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  -> {path.relative_to(REPO_DIR)}  ({len(items)} items, {len(categories_out)} categories)")


def write_expression_compat(path: Path, items: list[dict]) -> None:
    """
    data/dictionary/expression.json を SAFE 内容で上書き（現UI後方互換）。
    既存の key / label を保持する。
    """
    existing_key = "expression"
    existing_label = "表情"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            existing = json.load(f)
        existing_key = existing.get("key", existing_key)
        existing_label = existing.get("label", existing_label)

    payload = {
        "key": existing_key,
        "label": existing_label,
        "items": items,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  -> {path.relative_to(REPO_DIR)}  ({len(items)} items, UI compat)")


def main() -> None:
    print("=== compile_dictionary.py ===")
    print(f"Categories dir: {CATEGORIES_DIR.relative_to(REPO_DIR)}")

    if not CATEGORIES_DIR.exists():
        print(f"ERROR: categories dir not found: {CATEGORIES_DIR}", file=sys.stderr)
        sys.exit(1)

    category_files = sorted(CATEGORIES_DIR.glob("*.json"))
    if not category_files:
        print("ERROR: no category JSON files found", file=sys.stderr)
        sys.exit(1)

    r18_files = [f.name for f in category_files if f.stem.endswith("_r18")]
    safe_files = [f.name for f in category_files if not f.stem.endswith("_r18")]
    print(f"  SAFE files ({len(safe_files)}): {', '.join(safe_files)}")
    print(f"  R18  files ({len(r18_files)}): {', '.join(r18_files) or '(none)'}")

    # ── FULL（全カテゴリ、重複チェックはここで行う） ────────────────────────
    print("\n[FULL] Compiling all categories...")
    try:
        full_items = load_categories(exclude_r18=False)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # ── SAFE（_r18 を除外、FULL が通ればサブセットなので重複なし） ──────────
    print("\n[SAFE] Compiling (excluding *_r18.json)...")
    try:
        safe_items = load_categories(exclude_r18=True)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # ── カテゴリ別リスト ──────────────────────────────────────────────────────
    safe_cats = build_categories_out(exclude_r18=True)
    full_cats = build_categories_out(exclude_r18=False)

    # ── 出力 ─────────────────────────────────────────────────────────────────
    print("\n[OUTPUT] Writing compiled files...")
    write_compiled(COMPILED_DIR / "safe.json", safe_items, safe_cats)
    write_compiled(COMPILED_DIR / "full.json", full_items, full_cats)
    write_expression_compat(EXPRESSION_JSON, safe_items)

    r18_count = len(full_items) - len(safe_items)
    print(
        f"\n=== Done ===\n"
        f"  SAFE : {len(safe_items):4d} items  / {len(safe_cats)} categories\n"
        f"  FULL : {len(full_items):4d} items  / {len(full_cats)} categories  (+{r18_count} R18)\n"
    )


if __name__ == "__main__":
    main()
