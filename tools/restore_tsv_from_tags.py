#!/usr/bin/env python3
"""
restore_tsv_from_tags.py

Regenerate data/inbox/2026-03-03_tags_fixed.tsv from the intermediate
data/dictionary/tags.json.  The TSV is gitignored, so this script
reconstructs it when the original file is unavailable.

Note: The regenerated TSV is functionally equivalent (all rows preserved)
but does not restore any in-file comments or blank separator lines that
may have existed in the original.
"""
import csv
import json
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent
SOURCE_JSON = ROOT / "data/dictionary/tags.json"
TARGET_TSV  = ROOT / "data/inbox/2026-03-03_tags_fixed.tsv"
COLUMNS     = ["section", "jp_term", "definition", "danbooru_tag", "notes"]


def main() -> None:
    with open(SOURCE_JSON, encoding="utf-8") as f:
        d = json.load(f)

    TARGET_TSV.parent.mkdir(parents=True, exist_ok=True)

    rows_written = 0
    with open(TARGET_TSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, delimiter="\t",
                                extrasaction="ignore")
        writer.writeheader()
        for section in d["sections"]:
            key = section["key"]
            for item in section["items"]:
                writer.writerow({
                    "section":     key,
                    "jp_term":     item.get("jp_term",     ""),
                    "definition":  item.get("definition",  ""),
                    "danbooru_tag": item.get("danbooru_tag", ""),
                    "notes":       item.get("notes",       ""),
                })
                rows_written += 1

    print(f"  written : {TARGET_TSV.relative_to(ROOT)}")
    print(f"  rows    : {rows_written} (excl. header)")
    print(f"  sections: {len(d['sections'])}")


if __name__ == "__main__":
    main()
