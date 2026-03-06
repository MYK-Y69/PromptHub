"""
compile_sensitive.py
  Reads  : data/inbox/sensitive_oral.tsv  (section / jp / en / note)
  Writes : data/dictionary/compiled/tags_sensitive.json

Column mapping:
  section → tags[0]  (section key, e.g. "oral")
  en      → item.en  (danbooru tag / English label)
  jp      → item.jp  (Japanese label)
  note    → stored in jp as suffix （note）when present
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

ROOT        = Path(__file__).resolve().parent.parent
SOURCE_TSV  = ROOT / "data/inbox/sensitive_oral.tsv"
OUT         = ROOT / "data/dictionary/compiled/tags_sensitive.json"


def main() -> None:
    rows: list[dict] = []
    with open(SOURCE_TSV, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if not row.get("section") or row["section"] == "section":
                continue
            rows.append(row)

    flat_items: list[dict] = []
    categories: list[dict] = []
    section_map: dict[str, list[dict]] = {}
    section_order: list[str] = []

    item_id = 1
    for row in rows:
        sec = row["section"].strip()
        en  = row.get("en", "").strip()
        jp_raw = row.get("jp", "").strip()
        note = row.get("note", "").strip()

        jp = f"{jp_raw}（{note}）" if note else jp_raw

        if sec not in section_map:
            section_map[sec] = []
            section_order.append(sec)

        item = {
            "id":   item_id,
            "en":   en,
            "jp":   jp,
            "tags": [sec, en],
        }
        section_map[sec].append(item)
        flat_items.append(item)
        item_id += 1

    for sec in section_order:
        items = section_map[sec]
        start = flat_items.index(items[0])
        end   = start + len(items)
        categories.append({
            "key":   sec,
            "label": sec,
            "start": start,
            "end":   end,
        })

    doc = {
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count":        len(flat_items),
        "items":        flat_items,
        "categories":   categories,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"=== compile_sensitive ===")
    print(f"  source : {SOURCE_TSV.relative_to(ROOT)}  ({len(rows)} rows)")
    print(f"  items  : {len(flat_items)}")
    for sec in section_order:
        print(f"  [{sec}] {len(section_map[sec])} items")
    print(f"  → {OUT.relative_to(ROOT)}")
    print("=== Done ===")


if __name__ == "__main__":
    main()
