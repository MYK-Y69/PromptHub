#!/usr/bin/env python3
"""
Fix data2 import collisions in data/v2/tags.json.

The old TAGS data contains rows whose English prompt was reduced to a final
generic token such as "grab", "head", or "view". Later v2 data already contains
the correct compound tag in data2_* sections. This script removes only the
high-confidence broken duplicates and cleans trailing next-tag text from data2
Japanese descriptions.
"""

import datetime
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC_PATH = ROOT / "data/v2/tags.json"

BROKEN_SECTIONS = {
    "camera_comp",
    "touch_self",
    "hold",
    "body",
    "pose_action",
    "clothes",
}

GENERIC_EN = {
    "grab",
    "head",
    "mouth",
    "view",
    "back",
    "hair",
    "lift",
    "breasts",
    "hands",
    "legs",
    "shoulder",
    "chin",
    "cheek",
    "ass",
    "pull",
    "arms",
    "chest",
    "ground",
    "hand",
    "shot",
    "together",
    "waist",
}


def jp_title(jp: str) -> str:
    return re.split(r"[（(]", jp or "")[0].strip()


def norm_en(en: str) -> str:
    return re.sub(r"\s+", " ", (en or "").strip().lower())


def has_japanese(s: str) -> bool:
    return bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", s or ""))


def iter_tags(data: dict):
    for cat in data.get("categories", []):
        for sc in cat.get("subcategories", []):
            for sec in sc.get("sections", []):
                for idx, tag in enumerate(sec.get("tags", [])):
                    yield cat, sc, sec, idx, tag


def find_high_confidence_candidate(broken: dict, all_rows: list[dict]) -> dict | None:
    broken_title = jp_title(broken["tag"].get("jp", ""))
    if not broken_title:
        return None

    candidates = []
    for row in all_rows:
        if row is broken:
            continue
        tag = row["tag"]
        if norm_en(tag.get("en")) == norm_en(broken["tag"].get("en")):
            continue
        if jp_title(tag.get("jp", "")) != broken_title:
            continue
        if not row["section"]["id"].startswith("data2_"):
            continue
        candidates.append(row)

    if not candidates:
        return None

    candidates.sort(
        key=lambda r: (
            r["cat"]["id"] != broken["cat"]["id"],
            -len(r["tag"].get("en", "")),
        )
    )
    return candidates[0]


def clean_data2_jp(jp: str, en_set: set[str]) -> tuple[str, str | None]:
    """Remove a trailing next English tag accidentally captured in a JP desc."""
    if not jp.endswith("）"):
        return jp, None

    close = len(jp) - 1
    last_jp = -1
    for i in range(close - 1, -1, -1):
        if has_japanese(jp[i]):
            last_jp = i
            break

    if last_jp < 0:
        return jp, None

    tail = jp[last_jp + 1 : close].strip()
    if not tail:
        return jp, None
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9'’&/().,+:; -]*", tail):
        return jp, None
    if norm_en(tail) not in en_set:
        return jp, None

    cleaned = jp[: last_jp + 1] + "）"
    return cleaned, tail


def main() -> None:
    data = json.loads(SRC_PATH.read_text(encoding="utf-8"))

    all_rows = [
        {"cat": cat, "sc": sc, "section": sec, "idx": idx, "tag": tag}
        for cat, sc, sec, idx, tag in iter_tags(data)
    ]
    en_set = {norm_en(row["tag"].get("en", "")) for row in all_rows}

    removals = []
    for row in all_rows:
        sec_id = row["section"]["id"]
        en = norm_en(row["tag"].get("en", ""))
        if sec_id not in BROKEN_SECTIONS or en not in GENERIC_EN:
            continue
        candidate = find_high_confidence_candidate(row, all_rows)
        if candidate is None:
            continue
        removals.append((row, candidate))

    remove_by_section: dict[int, set[int]] = {}
    for row, _candidate in removals:
        remove_by_section.setdefault(id(row["section"]), set()).add(row["idx"])

    for cat in data.get("categories", []):
        for sc in cat.get("subcategories", []):
            for sec in sc.get("sections", []):
                indexes = remove_by_section.get(id(sec))
                if indexes:
                    sec["tags"] = [tag for i, tag in enumerate(sec.get("tags", [])) if i not in indexes]

    cleaned = []
    for _cat, _sc, sec, idx, tag in iter_tags(data):
        if not sec["id"].startswith("data2_"):
            continue
        old_jp = tag.get("jp", "")
        new_jp, removed_tail = clean_data2_jp(old_jp, en_set)
        if removed_tail:
            tag["jp"] = new_jp
            cleaned.append((sec["id"], idx, tag.get("en", ""), removed_tail))

    def count_tags(cat: dict) -> int:
        return sum(len(sec.get("tags", [])) for sc in cat.get("subcategories", []) for sec in sc.get("sections", []))

    data["generated_at"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    data["count"] = sum(count_tags(cat) for cat in data.get("categories", []))

    SRC_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    removed_counter = Counter(row["section"]["id"] for row, _candidate in removals)
    print(f"Removed high-confidence broken duplicates: {len(removals)}")
    for sec_id, count in sorted(removed_counter.items()):
        print(f"  {sec_id}: {count}")
    print(f"Cleaned data2 JP descriptions: {len(cleaned)}")
    for sec_id, idx, en, removed_tail in cleaned[:80]:
        print(f"  {sec_id} #{idx}: {en}  - removed trailing '{removed_tail}'")
    print(f"New count: {data['count']}")


if __name__ == "__main__":
    main()
