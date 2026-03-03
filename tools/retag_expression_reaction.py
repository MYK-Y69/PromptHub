"""
retag_expression_reaction.py

expression.json の各 item に reaction 系タグを付与する。

付与ルール:
  reaction  : 下記サブタグのいずれかに該当、または既存タグに blush_detail / sweat を含む
  arousal   : en に ahegao / torogao / in heat / aroused / fucked silly / foodgasm / breast awe
  breathing : en に breath / heavy breathing / holding breath / sigh / moaning
  saliva    : en に saliva / saliva trail / drooling / mouth drool
  heat_steam: en に hot / steam / head steam / steaming body / afterglow

※ blush_detail / sweat 既存タグは reaction のみ付与（サブタグは付与しない）
※ タグは重複なしで追加
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPRESSION_JSON = ROOT / "data/dictionary/categories/expression.json"

# en にマッチするキーワード → サブタグ名
SUBTAG_KEYWORDS: list[tuple[str, list[str]]] = [
    ("arousal",    ["ahegao", "torogao", "in heat", "aroused", "fucked silly", "foodgasm", "breast awe"]),
    ("breathing",  ["breath", "heavy breathing", "holding breath", "sigh", "moaning"]),
    ("saliva",     ["saliva", "saliva trail", "drooling", "mouth drool"]),
    ("heat_steam", ["hot", "steam", "head steam", "steaming body", "afterglow"]),
]

# 既存タグにあれば reaction のみ付与するトリガータグ
TRIGGER_TAGS = {"blush_detail", "sweat"}


def match_subtag(en: str, keywords: list[str]) -> bool:
    """en テキストがいずれかのキーワードを含むか（単語境界ベース）"""
    en_lower = en.lower()
    for kw in keywords:
        # キーワードが複数語の場合はそのまま部分一致、
        # 単語の場合は前後が非アルファベットであることを確認
        if " " in kw:
            if kw in en_lower:
                return True
        else:
            if re.search(r"(?<![a-z])" + re.escape(kw) + r"(?![a-z])", en_lower):
                return True
    return False


def main() -> None:
    with open(EXPRESSION_JSON, encoding="utf-8") as f:
        data = json.load(f)

    items: list[dict] = data["items"]

    counts: dict[str, int] = {subtag: 0 for subtag, _ in SUBTAG_KEYWORDS}
    counts["reaction"] = 0
    changed = 0

    for item in items:
        en: str = item.get("en", "")
        tags: list[str] = item.get("tags", [])
        tags_set = set(tags)
        added: set[str] = set()

        # サブタグ判定
        for subtag, keywords in SUBTAG_KEYWORDS:
            if subtag not in tags_set and match_subtag(en, keywords):
                added.add(subtag)

        # reaction 付与条件:
        #   サブタグが追加された OR 既存タグに blush_detail/sweat がある
        trigger_by_existing = bool(tags_set & TRIGGER_TAGS)
        if added or trigger_by_existing:
            if "reaction" not in tags_set:
                added.add("reaction")

        if not added:
            continue

        # タグを追加（元の順序を保ちつつ末尾に追加）
        for tag in added:
            if tag not in tags_set:
                tags.append(tag)
                tags_set.add(tag)

        item["tags"] = tags

        # カウント
        for tag in added:
            if tag in counts:
                counts[tag] += 1
        changed += 1

    # 書き戻し
    with open(EXPRESSION_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # レポート
    print(f"=== retag_expression_reaction ===")
    print(f"  reaction    : +{counts['reaction']}")
    for subtag, _ in SUBTAG_KEYWORDS:
        print(f"  {subtag:<12}: +{counts[subtag]}")
    print(f"  変更アイテム数 : {changed}")
    print(f"=================================")
    print("Done. 次のコマンドでコンパイルしてください:")
    print("  python3 tools/compile_dictionary.py")


if __name__ == "__main__":
    main()
