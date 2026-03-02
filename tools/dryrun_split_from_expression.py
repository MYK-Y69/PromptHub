#!/usr/bin/env python3
"""
dryrun_split_from_expression.py
  expression.json から pov / focus / meta(persona) に移動する候補を表示する。
  ファイルは一切変更しない。

Usage:
  python3 tools/dryrun_split_from_expression.py
"""
from __future__ import annotations
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CATS = REPO / "data" / "dictionary" / "categories"


def load_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"items": []}


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


def check_conflicts(candidates: list[dict], existing: list[dict], label: str) -> None:
    ex_ids = {it["id"] for it in existing}
    ex_en  = {it.get("en","").lower(): it["id"] for it in existing}
    for it in candidates:
        if it["id"] in ex_ids:
            print(f"  [ID衝突] {label}: id={it['id']} は既に存在 → スキップされる")
        elif it.get("en","").lower() in ex_en:
            print(f"  [意味重複] {label}: en='{it['en']}' ≈ 既存 id={ex_en[it['en'].lower()]}")


def show_group(label: str, items: list[dict], existing: list[dict]) -> None:
    print(f"\n=== {label} ({len(items)} items) ===")
    check_conflicts(items, existing, label)
    for it in items:
        print(f"  {it['id']:50s}  en={it['en']}")


def main() -> None:
    exp_data = load_json(CATS / "expression.json")
    pov_data = load_json(CATS / "pov.json")
    foc_data = load_json(CATS / "focus.json")
    met_data = load_json(CATS / "meta.json")

    pov_items, foc_items, meta_items, rest = classify(exp_data.get("items", []))

    print("=== dry-run: split_from_expression ===")
    print(f"expression 現在: {len(exp_data.get('items', []))} items")
    print(f"移動後      予定: {len(rest)} items")

    show_group("→ pov",   pov_items,  pov_data.get("items", []))
    show_group("→ focus", foc_items,  foc_data.get("items", []))
    show_group("→ meta",  meta_items, met_data.get("items", []))

    print(f"\n残留 expression: {len(rest)} items")
    print("\n[dry-run 完了 / ファイル変更なし]")


if __name__ == "__main__":
    main()
