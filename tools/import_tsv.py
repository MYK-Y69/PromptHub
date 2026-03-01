#!/usr/bin/env python3
"""
import_tsv.py  –  TSV → data/dictionary/<category>.json
Usage: python tools/import_tsv.py imports/inbox/expression_sample.tsv
"""
from __future__ import annotations

import sys
import re
import csv
import json
import os
from pathlib import Path

LABELS = {
    "expression": "表情",
}

DICT_DIR = Path(__file__).parent.parent / "data" / "dictionary"


def to_slug(category: str, en: str) -> str:
    """Generate an id like expression_half_closed_eyes from en text."""
    slug = en.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = re.sub(r"_+", "_", slug)
    slug = slug.strip("_")
    return f"{category}_{slug}"


def parse_tags(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def load_existing(path: Path) -> dict:
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


def main(tsv_path: str) -> None:
    tsv_file = Path(tsv_path)
    if not tsv_file.exists():
        print(f"ERROR: file not found: {tsv_file}", file=sys.stderr)
        sys.exit(1)

    # Read TSV
    rows = []
    with open(tsv_file, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rows.append(row)

    # Group by category (only rows that pass validation)
    by_category: dict[str, list[dict]] = {}
    skipped = 0
    for row in rows:
        cat = row.get("category", "").strip()
        en = row.get("en", "").strip()
        jp = row.get("jp", "").strip()

        if not cat or not en:
            skipped += 1
            continue

        item = {
            "id": to_slug(cat, en),
            "jp": jp,
            "en": en,
            "tags": parse_tags(row.get("tags") or ""),
            "source": (row.get("source") or "").strip(),
        }
        by_category.setdefault(cat, []).append(item)

    if skipped:
        print(f"Skipped {skipped} row(s) (missing category or en).")

    DICT_DIR.mkdir(parents=True, exist_ok=True)

    for cat, new_items in by_category.items():
        out_path = DICT_DIR / f"{cat}.json"
        existing = load_existing(out_path)

        if existing:
            existing_en = {item["en"] for item in existing["items"]}
            added = 0
            for item in new_items:
                if item["en"] not in existing_en:
                    existing["items"].append(item)
                    existing_en.add(item["en"])
                    added += 1
            existing["items"].sort(key=lambda x: x["en"].lower())
            data = existing
            print(f"[{cat}] {added} item(s) added, {len(existing_en) - added} already existed.")
        else:
            seen_en: set[str] = set()
            deduped = []
            for item in new_items:
                if item["en"] not in seen_en:
                    deduped.append(item)
                    seen_en.add(item["en"])
            deduped.sort(key=lambda x: x["en"].lower())
            data = {
                "key": cat,
                "label": LABELS.get(cat, cat),
                "items": deduped,
            }
            print(f"[{cat}] Created with {len(deduped)} item(s).")

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/import_tsv.py <path_to_tsv>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])
