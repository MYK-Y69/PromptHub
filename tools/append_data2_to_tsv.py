#!/usr/bin/env python3
"""
append_data2_to_tsv.py

Convert data2 category JSONs (SAFE/FULL side) to TAGS TSV rows and
append them to data/inbox/2026-03-03_tags_fixed.tsv.

- Skips items already present in the TSV (exact danbooru_tag match,
  case-insensitive + normalised).
- Maps the 6 data2 categories to TAGS section names.
- Writes notes="from:data2" to mark provenance.
"""
import csv
import json
import re
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
TSV_PATH  = ROOT / "data/inbox/2026-03-03_tags_fixed.tsv"
CAT_DIR   = ROOT / "data/dictionary/categories"
COLUMNS   = ["section", "jp_term", "definition", "danbooru_tag", "notes"]

# data2 category key → TAGS section name
# New sections: body, pose_action, accessories, e621_pony
# Merge into existing: camera_comp, clothes
SECTION_MAP: dict[str, str] = {
    "camera_comp":   "camera_comp",   # existing section
    "body_features": "body",          # new section
    "pose_action":   "pose_action",   # new section (separate from action)
    "clothing":      "clothes",       # merge into existing section
    "accessories":   "accessories",   # new section
    "e621_pony":     "e621_pony",     # new section
}

DATA2_CATS = list(SECTION_MAP.keys())


def normalize(s: str) -> str:
    return re.sub(r'[\s\-_/]+', '', s.lower())


def load_existing_keys(tsv: Path) -> set[str]:
    """Return normalised set of existing danbooru_tag values in the TSV."""
    keys: set[str] = set()
    if not tsv.exists():
        return keys
    with open(tsv, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            dan = row.get("danbooru_tag", "").strip()
            if dan:
                keys.add(normalize(dan))
    return keys


def main() -> None:
    existing = load_existing_keys(TSV_PATH)
    print(f"  existing TSV entries: {len(existing)}")

    new_rows: list[dict] = []
    skipped: list[str] = []

    for cat_key in DATA2_CATS:
        p = CAT_DIR / f"{cat_key}.json"
        if not p.exists():
            print(f"  [SKIP] {p.name} not found")
            continue
        with open(p, encoding="utf-8") as f:
            d = json.load(f)

        section = SECTION_MAP[cat_key]
        for item in d.get("items", []):
            en   = item.get("en", "").strip()
            jp   = item.get("jp", "").strip()
            desc = item.get("desc", "").strip()
            nk   = normalize(en)

            if nk in existing:
                skipped.append(en)
                continue

            new_rows.append({
                "section":      section,
                "jp_term":      jp,
                "definition":   desc,
                "danbooru_tag": en,
                "notes":        "from:data2",
            })
            existing.add(nk)  # prevent cross-category duplicates

    print(f"  skipped (already in TAGS): {len(skipped)}")
    print(f"  skipped items: {skipped}")
    print(f"  new rows to append: {len(new_rows)}")

    if not new_rows:
        print("  nothing to append.")
        return

    # Append (ensure trailing newline before appending)
    content = TSV_PATH.read_text(encoding="utf-8")
    if content and not content.endswith("\n"):
        content += "\n"

    with open(TSV_PATH, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, delimiter="\t",
                                extrasaction="ignore", lineterminator="\n")
        for row in new_rows:
            writer.writerow(row)

    print()
    print("  appended rows by section:")
    from collections import Counter
    ctr = Counter(r["section"] for r in new_rows)
    for sec, cnt in sorted(ctr.items()):
        items_in_sec = [r["danbooru_tag"] for r in new_rows if r["section"] == sec]
        print(f"    {sec}: {cnt} → {items_in_sec}")

    # Verify total
    with open(TSV_PATH, encoding="utf-8", newline="") as f:
        total = sum(1 for _ in csv.DictReader(f, delimiter="\t"))
    print(f"\n  TSV total after append: {total} rows")


if __name__ == "__main__":
    main()
