"""
compile_tags.py
  Reads  : data/inbox/2026-03-03_tags_fixed.tsv  (source of truth)
  Writes : data/dictionary/tags.json             (sections-based intermediate)
           data/dictionary/compiled/tags.json    (flat + categories index for UI)

Section remapping rules (applied at compile time so the TSV stays untouched):
  tech     zettai ryouiki / thigh gap            → clothes
  effect   lens flare / motion blur /
           chromatic aberration / film grain /
           motion lines / afterimage             → camera
  tech2    depth of field / bokeh                → camera
  gaze     dutch angle                           → camera

Extra items injected into camera section:
  resolution (Danbooru tag)
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_TSV    = ROOT / "data/inbox/2026-03-03_tags_fixed.tsv"
OUT_TAGS      = ROOT / "data/dictionary/tags.json"
OUT_COMPILED  = ROOT / "data/dictionary/compiled/tags.json"

# ---------------------------------------------------------------------------
# Section remapping: (original_section, danbooru_tag_or_definition) → new_section
# Keys are matched against both danbooru_tag and definition (lowercased).
# ---------------------------------------------------------------------------
REMAP: dict[tuple[str, str], str] = {
    ("tech",   "zettai ryouiki"):      "clothes",
    ("tech",   "thigh gap"):           "clothes",
    ("effect", "lens flare"):          "camera",
    ("effect", "motion blur"):         "camera",
    ("effect", "chromatic aberration"):"camera",
    ("effect", "film grain"):          "camera",
    ("effect", "motion lines"):        "camera",
    ("effect", "afterimage"):          "camera",
    ("tech2",  "depth of field"):      "camera",
    ("tech2",  "bokeh"):               "camera",
    ("gaze",   "dutch angle"):         "camera",
}

# Extra items to inject (appended to the named section after TSV rows are processed)
EXTRA_ITEMS: list[dict] = [
    {
        "section":      "camera",
        "jp_term":      "解像度",
        "definition":   "resolution",
        "danbooru_tag": "resolution",
        "notes":        "",
    },
]

# ---------------------------------------------------------------------------
# Style guard: items that land in 'style' are re-routed if their en text
# matches camera or clothes keywords.  Clothes takes priority over camera.
# Applied ONLY when the resolved section is 'style'.
# ---------------------------------------------------------------------------
STYLE_GUARD_TO_CAMERA_KEYWORDS = [
    "lens", "dof", "bokeh", "depth of field", "angle", "shot", "blur",
    "resolution", "4k", "8k", "focus", "composition", "framing",
    "leading lines", "rule of thirds", "symmetry",
]
STYLE_GUARD_TO_CLOTHES_KEYWORDS = [
    "uniform", "bikini", "dress", "skirt", "stockings", "thighhigh",
    "zettai ryouiki", "lingerie", "bra", "panties",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def resolve_section(row: dict) -> str:
    sec = row["section"].strip()
    dan = row.get("danbooru_tag", "").strip().lower()
    dfn = row.get("definition",   "").strip().lower()

    # 1. Apply explicit REMAP first (unchanged behaviour)
    sec = REMAP.get((sec, dan)) or REMAP.get((sec, dfn)) or sec

    # 2. Style/Misc guard — re-routes items with known keywords.
    #    'misc' is the default section for add_danbooru_tag.py auto-inserts.
    if sec in ("style", "misc"):
        en = dan or dfn  # same derivation as make_en()
        if any(kw in en for kw in STYLE_GUARD_TO_CLOTHES_KEYWORDS):
            return "clothes"
        if any(kw in en for kw in STYLE_GUARD_TO_CAMERA_KEYWORDS):
            return "camera"

    return sec


def make_en(row: dict) -> str:
    dan = row.get("danbooru_tag", "").strip()
    if dan:
        return dan
    return row.get("definition", "").strip()


def make_jp(row: dict) -> str:
    jp  = row.get("jp_term",    "").strip()
    dfn = row.get("definition", "").strip()
    nts = row.get("notes",      "").strip()
    if dfn and nts:
        return f"{jp}（{dfn} / {nts}）"
    if dfn:
        return f"{jp}（{dfn}）"
    return jp


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # 1. Read TSV
    rows: list[dict] = []
    with open(SOURCE_TSV, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            # Skip blank / duplicate header rows
            if not row.get("section") or row["section"] == "section":
                continue
            rows.append(row)

    # Inject extra items
    for extra in EXTRA_ITEMS:
        rows.append(extra)

    # 2. Group by resolved section (preserving first-seen order)
    sections_order: list[str] = []
    sections_map: dict[str, list[dict]] = {}
    for row in rows:
        sec = resolve_section(row)
        if sec not in sections_map:
            sections_map[sec] = []
            sections_order.append(sec)
        sections_map[sec].append({
            "jp_term":      row.get("jp_term",    "").strip(),
            "definition":   row.get("definition", "").strip(),
            "danbooru_tag": row.get("danbooru_tag","").strip(),
            "notes":        row.get("notes",       "").strip(),
        })

    sections_list = [
        {"key": k, "label": k, "items": sections_map[k]}
        for k in sections_order
    ]

    # 3. Write tags.json (intermediate)
    tags_doc = {
        "generated_at":   datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source_tsv":     str(SOURCE_TSV.relative_to(ROOT)),
        "count_rows":     len(rows),
        "count_sections": len(sections_list),
        "sections":       sections_list,
    }
    OUT_TAGS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_TAGS, "w", encoding="utf-8") as f:
        json.dump(tags_doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 4. Build compiled/tags.json (flat items + categories index)
    flat_items: list[dict] = []
    categories: list[dict] = []
    item_id = 1
    for sec in sections_list:
        start = len(flat_items)
        for it in sec["items"]:
            en = it["danbooru_tag"] if it["danbooru_tag"] else it["definition"]
            jp = make_jp(it)
            flat_items.append({
                "id":   item_id,
                "en":   en,
                "jp":   jp,
                "tags": [sec["key"], en],
            })
            item_id += 1
        end = len(flat_items)
        if end > start:
            categories.append({
                "key":   sec["key"],
                "label": sec["key"],
                "start": start,
                "end":   end,
            })

    compiled_doc = {
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count":        len(flat_items),
        "items":        flat_items,
        "categories":   categories,
    }
    OUT_COMPILED.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_COMPILED, "w", encoding="utf-8") as f:
        json.dump(compiled_doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 5. Report
    print(f"=== compile_tags ===")
    print(f"  source : {SOURCE_TSV.relative_to(ROOT)}  ({len(rows)} rows)")
    print(f"  sections: {len(sections_list)}")
    print(f"  items   : {len(flat_items)}")
    remap_report = {}
    for (sec_from, tag), sec_to in REMAP.items():
        remap_report.setdefault(f"{sec_from} → {sec_to}", []).append(tag)
    for k, v in remap_report.items():
        print(f"  remap  [{k}]: {v}")
    print(f"  extra  : {[e['danbooru_tag'] or e['definition'] for e in EXTRA_ITEMS]}")
    print(f"  → {OUT_TAGS.relative_to(ROOT)}")
    print(f"  → {OUT_COMPILED.relative_to(ROOT)}")
    print("=== Done ===")


if __name__ == "__main__":
    main()
