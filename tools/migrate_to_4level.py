#!/usr/bin/env python3
"""
tools/migrate_to_4level.py
data/v2/tags.json を 3階層 (categories→sections→tags) から
4階層 (categories→subcategories→sections→tags) に変換する。
"""

from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
V2_SRC = ROOT / "data/v2/tags.json"

# ---------------------------------------------------------------------------
# サブカテゴリ定義
# 各エントリ: (subcategory_id, label_jp, [section_id_or_prefix, ...])
# prefix は末尾 * で表現 → "mm_787_" にマッチ
# ---------------------------------------------------------------------------

SUBCATEGORY_DEFS: dict[str, list[tuple[str, str, list[str]]]] = {

    "camera": [
        ("cam_framing",    "構図・カメラ",     [
            "camera_comp", "focus", "angle", "gaze", "camera", "pov", "data2_camera",
        ]),
        ("cam_nature",     "自然・野外",        ["mm_787_*", "mm_655_*"]),
        ("cam_building",   "建造物・施設",      ["mm_791_*", "mm_1323_*"]),
        ("cam_interior",   "室内・インドア",    ["mm_793_*", "mm_1328_*", "mm_1595_*", "mm_338_*"]),
        ("cam_background", "背景・デザイン",    ["mm_567_*"]),
    ],

    "expression": [
        ("expr_emotion",   "表情・感情",        [
            "expr_smile", "expr_evil", "expr_misc", "shake", "tired",
            "mood_bad", "anger", "confusion", "anxiety", "fear", "sad",
            "safe_expression", "mm_5_*",
        ]),
        ("expr_eye",       "目",               ["eye", "eye_empty", "mm_29_*"]),
        ("expr_mouth",     "口・歯",            ["mouth", "teeth", "lip", "mm_707_*"]),
        ("expr_face",      "顔の特徴",          [
            "face_feature", "nose", "brow", "mark", "mm_994_*", "mm_1565_*",
        ]),
        ("expr_skin",      "肌・化粧",          ["makeup", "paint", "mm_274_*"]),
        ("expr_hair",      "髪型",             ["mm_77_*"]),
    ],

    "pose": [
        ("pose_hands",     "手・腕",            ["pose_hand", "pose_arm", "mm_96_*", "mm_982_*"]),
        ("pose_body",      "体・姿勢",          [
            "torso", "rest", "point", "support", "misc_pose",
            "safe_pose", "data2_pose", "uncat",
        ]),
        ("pose_standing",  "立ち・座り・寝",    ["sit", "kneel", "stand", "mm_93_*"]),
        ("pose_legs",      "脚・足",            ["legs", "feet", "legmove", "other_pose", "mm_710_*"]),
        ("pose_touch",     "タッチ・接触",      ["touch_self", "touch_env"]),
    ],

    "action": [
        ("act_general",    "一般動作",          [
            "action", "trouble", "hold", "prep", "body",
            "pose_action", "safe_action",
        ]),
        ("act_touch",      "接触・触れ合い",    [
            "data2_touch_self", "data2_touch_other", "data2_touch_any", "mm_906_*",
        ]),
        ("act_combat",     "戦闘・アクション",  ["mm_915_*"]),
        ("act_movement",   "移動・運動",        ["mm_1296_*"]),
    ],

    "clothing": [
        ("cl_tops",        "トップス",          [
            "clothes", "data2_clothing", "mm_838_*", "mm_866_*", "mm_882_*", "mm_864_*",
        ]),
        ("cl_bottoms",     "ボトムス",          ["mm_843_*", "mm_880_*", "mm_855_*", "mm_267_*"]),
        ("cl_dresses",     "ドレス・ワンピース","mm_835_*"),
        ("cl_uniforms",    "制服・スーツ",      ["mm_1023_*", "mm_853_*"]),
        ("cl_swimwear",    "水着",              ["mm_571_*"]),
        ("cl_underwear",   "下着",              ["mm_238_*"]),
        ("cl_legwear",     "靴下・靴",          ["mm_546_*", "mm_548_*", "mm_588_*"]),
        ("cl_outerwear",   "アウター",          ["mm_857_*", "mm_868_*"]),
        ("cl_special",     "特殊・その他",      ["mm_878_*", "mm_903_*", "mm_1260_*", "mm_1265_*", "mm_1550_*"]),
    ],

    "accessories": [
        ("acc_general",    "全般",              ["accessories", "data2_accessories"]),
        ("acc_hats",       "帽子",              ["mm_811_*"]),
        ("acc_glasses",    "メガネ",            ["mm_768_*"]),
        ("acc_hair",       "髪飾り",            ["mm_1474_*"]),
        ("acc_neck",       "首元",              ["mm_805_*"]),
    ],

    "people": [
        ("ppl_general",    "全般",              [
            "count", "relationship", "misc_people", "layout", "data2_body_features",
        ]),
        ("ppl_types",      "キャラタイプ",      ["mm_184_*", "mm_350_*", "mm_772_*"]),
        ("ppl_costumes",   "コスチューム",      ["mm_147_*", "mm_618_*", "mm_622_*", "mm_752_*", "mm_1222_*"]),
        ("ppl_fantasy",    "ファンタジー種族",  ["mm_641_*", "mm_643_*", "mm_645_*", "mm_754_*"]),
        ("ppl_special",    "特殊表現",          ["mm_368_*", "mm_657_*", "mm_1006_*", "mm_1234_*"]),
    ],

    "meta": [
        ("meta_quality",   "品質・技術",        [
            "tech2", "quality", "quality2", "qc", "artifact", "revision", "dup",
        ]),
        ("meta_style",     "スタイル・エフェクト", ["effect", "effect2", "style", "style2", "mm_1217_*"]),
        ("meta_layout",    "レイアウト・マンガ", [
            "manga_panel", "manga_read", "cover", "frame",
            "orientation", "shape", "mm_937_*", "mm_1304_*",
        ]),
        ("meta_ref",       "体型・構図参照",    ["mm_1307_*"]),
        ("meta_text",      "テキスト・UI",      ["meta_text", "doc", "ui"]),
        ("meta_misc",      "その他",            ["mm_196_*", "mm_807_*", "mm_1375_*", "mm_1341_*"]),
    ],

    "sensitive": [
        ("sen_body",       "体の描写",          ["mm_62_*", "mm_647_*", "mm_697_*", "mm_1555_*", "mm_1584_*"]),
        ("sen_genitals",   "性器",              ["mm_668_*", "mm_670_*", "mm_927_*", "mm_166_*"]),
        ("sen_acts",       "行為",              [
            "mm_473_*", "mm_198_*", "mm_161_*", "mm_281_*",
            "mm_118_*", "mm_135_*", "mm_967_*", "mm_1001_*",
            "mm_221_*", "mm_750_*",
        ]),
        ("sen_scenarios",  "シチュエーション",  [
            "mm_323_*", "mm_343_*", "mm_363_*", "mm_360_*", "mm_332_*",
        ]),
        ("sen_bdsm",       "拘束・BDSM",        ["mm_1032_*", "mm_1033_*", "mm_1229_*", "mm_1281_*"]),
        ("sen_other",      "その他",            ["sexpos", "e621_pony", "mm_374_*", "mm_1450_*"]),
    ],
}


# ---------------------------------------------------------------------------
# マッチングロジック
# ---------------------------------------------------------------------------

def _make_matcher(patterns: list[str] | str):
    """パターンリスト（または単一文字列）→ section_id マッチャーを返す。"""
    if isinstance(patterns, str):
        patterns = [patterns]
    prefixes = [p[:-1] for p in patterns if p.endswith("*")]
    exacts   = {p for p in patterns if not p.endswith("*")}

    def match(sec_id: str) -> bool:
        if sec_id in exacts:
            return True
        for prefix in prefixes:
            if sec_id.startswith(prefix):
                return True
        return False

    return match


# ---------------------------------------------------------------------------
# 変換
# ---------------------------------------------------------------------------

def migrate(data: dict) -> dict:
    """categories: [{id, sections[]}] → [{id, subcategories[{id, sections[]}]}]"""
    for cat in data["categories"]:
        cat_id = cat["id"]
        defs = SUBCATEGORY_DEFS.get(cat_id)

        if not defs:
            # 定義なし → sections をそのまま1つのサブカテゴリ "general" に包む
            cat["subcategories"] = [
                {
                    "id": f"{cat_id}_general",
                    "label": "全般",
                    "sections": cat.pop("sections"),
                }
            ]
            continue

        # サブカテゴリごとのセクション仕分け
        matchers = [(sid, label, _make_matcher(pats)) for sid, label, pats in defs]
        assigned: set[str] = set()
        subcats = []

        for sid, label, matcher in matchers:
            matched_secs = [s for s in cat["sections"] if matcher(s["id"])]
            for s in matched_secs:
                assigned.add(s["id"])
            subcats.append({
                "id": sid,
                "label": label,
                "sections": matched_secs,
            })

        # 未割り当てセクションを "その他" へ
        unassigned = [s for s in cat["sections"] if s["id"] not in assigned]
        if unassigned:
            print(f"  [{cat_id}] {len(unassigned)} unassigned sections → fallback subcat:")
            for s in unassigned:
                print(f"    {s['id']}")
            # 最後の "その他" サブカテゴリに追加、なければ新規
            other_found = False
            for sc in subcats:
                if sc["id"].endswith("_other") or sc["id"].endswith("_misc"):
                    sc["sections"].extend(unassigned)
                    other_found = True
                    break
            if not other_found:
                subcats.append({
                    "id": f"{cat_id}_other",
                    "label": "その他",
                    "sections": unassigned,
                })

        cat["subcategories"] = subcats
        del cat["sections"]

    # count 再計算
    data["count"] = sum(
        len(t)
        for cat in data["categories"]
        for sc in cat["subcategories"]
        for sec in sc["sections"]
        for t in [sec["tags"]]
    )
    data["schema_version"] = "2.1"

    return data


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    with open(V2_SRC, encoding="utf-8") as f:
        data = json.load(f)

    print(f"Before: {data['count']} tags / {len(data['categories'])} categories")
    print(f"Schema: {data.get('schema_version', '?')}")

    # 既に変換済みならスキップ
    if "subcategories" in data["categories"][0]:
        print("Already 4-level structure. Skipping.")
        return

    data = migrate(data)

    print(f"\nAfter: {data['count']} tags")
    for cat in data["categories"]:
        n_sc  = len(cat["subcategories"])
        n_sec = sum(len(sc["sections"]) for sc in cat["subcategories"])
        n_tag = sum(len(s["tags"]) for sc in cat["subcategories"] for s in sc["sections"])
        print(f"  {cat['id']:15s} {n_sc} subcats / {n_sec} sections / {n_tag} tags")

    with open(V2_SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {V2_SRC}")


if __name__ == "__main__":
    main()
