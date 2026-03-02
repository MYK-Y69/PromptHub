#!/usr/bin/env python3
"""
split_from_expression.py
  expression.json から pov / focus / meta にアイテムを移動する。

移動ルール:
  - en に "pov"     → pov.json
  - en に "focus"   → focus.json
  - en に "persona" → meta.json

マージルール:
  - 同一 id が既存ファイルに存在する場合はスキップ（ログ出力）
  - 移動先カテゴリタグを tags に追加（重複除去）
  - meta.json が存在しない or 空の場合は key/label を設定して作成

compile は別途実行:
  python3 tools/compile_dictionary.py

Usage:
  python3 tools/split_from_expression.py
"""
from __future__ import annotations
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CATS = REPO / "data" / "dictionary" / "categories"

TARGET_TAG = {
    "pov":   "pov",
    "focus": "focus",
    "meta":  "meta",
}

META_TEMPLATE = {"key": "meta", "label": "Meta", "items": []}


def load_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"items": []}


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def classify(items: list[dict]) -> tuple[list, list, list, list]:
    pov, focus, meta, rest = [], [], [], []
    for it in items:
        en = it.get("en", "").lower()
        if "pov" in en:
            pov.append(it)
        elif "focus" in en:
            focus.append(it)
        elif "persona" in en:
            meta.append(it)
        else:
            rest.append(it)
    return pov, focus, meta, rest


def merge_into(candidates: list[dict], target_data: dict, cat_tag: str) -> int:
    existing_ids = {it["id"] for it in target_data["items"]}
    added = 0
    for it in candidates:
        if it["id"] in existing_ids:
            print(f"  [SKIP / id重複] {it['id']}")
            continue
        # tags: 既存を保持しつつ cat_tag を追加
        tags = list(it.get("tags", []))
        if cat_tag not in tags:
            tags.append(cat_tag)
        target_data["items"].append(dict(it, tags=tags))
        existing_ids.add(it["id"])
        added += 1
    return added


def main() -> None:
    exp_path = CATS / "expression.json"
    pov_path = CATS / "pov.json"
    foc_path = CATS / "focus.json"
    met_path = CATS / "meta.json"

    exp_data = load_json(exp_path)
    pov_data = load_json(pov_path)
    foc_data = load_json(foc_path)
    met_data = load_json(met_path)

    # meta が空の場合は key/label を設定
    if not met_data.get("key"):
        met_data = dict(META_TEMPLATE, items=list(met_data.get("items", [])))

    pov_items, foc_items, meta_items, rest = classify(exp_data.get("items", []))

    print("=== split_from_expression ===")
    print(f"expression 変更前: {len(exp_data.get('items', []))} items")

    n_pov  = merge_into(pov_items,  pov_data, "pov")
    n_foc  = merge_into(foc_items,  foc_data, "focus")
    n_meta = merge_into(meta_items, met_data, "meta")

    print(f"  → pov   追加: {n_pov}  / 対象 {len(pov_items)}")
    print(f"  → focus 追加: {n_foc}  / 対象 {len(foc_items)}")
    print(f"  → meta  追加: {n_meta}  / 対象 {len(meta_items)}")

    # expression から移動分を除去
    exp_data["items"] = rest

    # 書き出し
    write_json(exp_path, exp_data)
    write_json(pov_path, pov_data)
    write_json(foc_path, foc_data)
    write_json(met_path, met_data)

    print(f"\nexpression 変更後: {len(rest)} items")
    print("pov:   ", len(pov_data["items"]), "items")
    print("focus: ", len(foc_data["items"]), "items")
    print("meta:  ", len(met_data["items"]), "items")
    print("\n[完了 / compile は別途実行してください]")
    print("  python3 tools/compile_dictionary.py")


if __name__ == "__main__":
    main()
