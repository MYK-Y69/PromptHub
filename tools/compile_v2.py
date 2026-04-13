#!/usr/bin/env python3
"""
v2 compile スクリプト
data/v2/tags.json (ソース) → data/v2/compiled/tags.json (app 用)

app 用出力フォーマット:
{
  "schema_version": "2.0",
  "generated_at": "...",
  "count": N,
  "categories": [
    {
      "id": "camera",
      "label": "カメラ・構図",
      "sections": [
        {
          "id": "camera_comp",
          "label": "構図",
          "tags": [
            {"en": "...", "jp": "...", "target": null, "target_note": null}
          ]
        }
      ]
    }
  ]
}

ソースをそのままコンパクト化して出力する（インデントなし）。
"""

import json
import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC_PATH = ROOT / "data/v2/tags.json"
OUT_DIR = ROOT / "data/v2/compiled"
OUT_PATH = OUT_DIR / "tags.json"


def compile_v2():
    if not SRC_PATH.exists():
        raise FileNotFoundError(f"Source not found: {SRC_PATH}")

    with open(SRC_PATH, encoding="utf-8") as f:
        src = json.load(f)

    # 生成時刻を更新
    src["generated_at"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    # カウント再計算（4階層 / 3階層両対応）
    def _count_tags(cat: dict) -> int:
        if "subcategories" in cat:
            return sum(len(s["tags"]) for sc in cat["subcategories"] for s in sc["sections"])
        return sum(len(s["tags"]) for s in cat.get("sections", []))

    src["count"] = sum(_count_tags(cat) for cat in src["categories"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Compiled: {OUT_PATH}")
    print(f"  schema_version : {src['schema_version']}")
    print(f"  total tags     : {src['count']}")
    print(f"  categories     : {len(src['categories'])}")
    for cat in src["categories"]:
        if "subcategories" in cat:
            n_sc  = len(cat["subcategories"])
            n_sec = sum(len(sc["sections"]) for sc in cat["subcategories"])
            n_tag = _count_tags(cat)
            print(f"    {cat['id']:15s}  {n_sc:2d} subcats  {n_sec:3d} sections  {n_tag:5d} tags")
        else:
            n_sec = len(cat.get("sections", []))
            n_tag = _count_tags(cat)
            print(f"    {cat['id']:15s}  {n_sec:3d} sections  {n_tag:5d} tags")


if __name__ == "__main__":
    compile_v2()
