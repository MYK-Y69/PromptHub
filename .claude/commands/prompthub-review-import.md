import 済みブランチの差分をレビューし、必要最小限の修正を加えて再 compile する。

以下の手順を **そのまま** 実行してください（ユーザーに確認は取らない）:

---

## Step 1: ブランチ・差分確認

```bash
git branch --show-current
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

- `main` ブランチにいる場合はユーザーに確認する。
- `feat/data2-import-*` 以外のブランチにいる場合はユーザーに確認する。
- 差分がない場合は「import 済みの差分が見つかりません」と伝えて終了する。

---

## Step 2: 追加カテゴリ JSON の内容確認

追加・変更された `data/dictionary/categories/*.json` を全件確認する:

```python
import json, subprocess
from pathlib import Path

# git diff で変更されたカテゴリファイルを特定
result = subprocess.run(
    ["git", "diff", "--name-only", "origin/main..HEAD"],
    capture_output=True, text=True
)
changed = [
    Path(f) for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

cat_dir = Path("data/dictionary/categories")
print(f"変更されたカテゴリファイル: {len(changed)} 件\n")

for p in sorted(changed):
    full_path = cat_dir / p.name if not p.is_absolute() else p
    if not full_path.exists():
        print(f"[{p.name}] ファイルなし（削除済み）")
        continue
    with open(full_path) as f:
        d = json.load(f)
    items = d.get("items", [])
    print(f"[{p.name}]  label={d.get('label')!r}  件数={len(items)}")
    for i, item in enumerate(items[:5]):
        desc_preview = (item.get("desc", "") or "")[:40]
        print(f"  {i+1}. {item['en']:35s} / {item['jp']:20s}")
    if len(items) > 5:
        print(f"  ... (+{len(items)-5} 件)")
    print()
```

---

## Step 3: 近似重複・誤分類チェック

```python
import json, re, subprocess
from pathlib import Path
from collections import defaultdict

cat_dir = Path("data/dictionary/categories")

# 変更ファイルを特定
result = subprocess.run(
    ["git", "diff", "--name-only", "origin/main..HEAD"],
    capture_output=True, text=True
)
new_cat_keys = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

# 既存語彙（変更ファイル以外）
existing: dict[str, tuple[str, dict]] = {}  # en_lower -> (file, item)

def normalize(s):
    return re.sub(r'[\s\-_/]+', '', s.lower())

exist_norm: dict[str, tuple[str, dict]] = {}

for jf in sorted(cat_dir.glob("*.json")):
    if jf.stem in new_cat_keys:
        continue
    with open(jf) as f:
        d = json.load(f)
    for item in d.get("items", []):
        en = item.get("en", "")
        existing[en.lower()] = (jf.stem, item)
        exist_norm[normalize(en)] = (jf.stem, item)

issues: list[dict] = []

# 新カテゴリ同士の重複チェックも行う
all_new_items: list[tuple[str, dict]] = []
for key in new_cat_keys:
    p = cat_dir / f"{key}.json"
    if not p.exists():
        continue
    with open(p) as f:
        d = json.load(f)
    for item in d.get("items", []):
        all_new_items.append((key, item))

new_en_lower: dict[str, str] = {}  # en_lower -> cat_key (重複検出用)

for cat_key, item in all_new_items:
    en = item["en"]
    en_lower = en.lower()
    en_norm = normalize(en)

    # 既存との重複
    if en_lower in existing:
        ex_file, ex_item = existing[en_lower]
        issues.append({
            "type": "DUP_EXACT",
            "cat": cat_key,
            "en": en,
            "jp": item["jp"],
            "existing_file": ex_file,
            "existing_en": ex_item["en"],
            "note": "完全一致の重複"
        })
    elif en_norm in exist_norm:
        ex_file, ex_item = exist_norm[en_norm]
        issues.append({
            "type": "DUP_NORM",
            "cat": cat_key,
            "en": en,
            "jp": item["jp"],
            "existing_file": ex_file,
            "existing_en": ex_item["en"],
            "note": "表記ゆれ重複"
        })

    # 新カテゴリ同士の重複
    if en_lower in new_en_lower and new_en_lower[en_lower] != cat_key:
        issues.append({
            "type": "DUP_CROSS",
            "cat": cat_key,
            "en": en,
            "jp": item["jp"],
            "existing_file": new_en_lower[en_lower],
            "existing_en": en,
            "note": "新カテゴリ間の重複"
        })
    new_en_lower[en_lower] = cat_key

# ── 誤分類チェック ──────────────────────────────────────────────
# 身体部位なのに accessories にいる語（取り外せない身体特徴）
BODY_PARTS_IN_ACCESSORIES = ["wings", "horns", "tails", "tail", "ears", "fur", "scales", "feathers"]
for cat_key, item in all_new_items:
    if cat_key == "accessories" and item["en"].lower() in BODY_PARTS_IN_ACCESSORIES:
        issues.append({
            "type": "MISPLACE_BODY_IN_ACC",
            "cat": cat_key,
            "en": item["en"],
            "jp": item["jp"],
            "note": "身体特徴を accessories に配置。body_features が適切な可能性",
        })

# body_features にポーズ・服装が混ざっていないか
POSE_KEYWORDS = ["pose", "sitting", "standing", "lying", "reaching", "kneeling"]
CLOTHING_KEYWORDS = ["shirt", "dress", "skirt", "pants", "bra", "swimsuit", "uniform"]
for cat_key, item in all_new_items:
    en = item["en"].lower()
    if cat_key == "body_features":
        if any(kw in en for kw in POSE_KEYWORDS):
            issues.append({"type": "MISPLACE_POSE_IN_BF", "cat": cat_key, "en": item["en"],
                           "jp": item["jp"], "note": "ポーズ語が body_features に混入の可能性"})
        if any(kw in en for kw in CLOTHING_KEYWORDS):
            issues.append({"type": "MISPLACE_CLOTH_IN_BF", "cat": cat_key, "en": item["en"],
                           "jp": item["jp"], "note": "服装語が body_features に混入の可能性"})

# 出力
if issues:
    print(f"⚠️  指摘事項: {len(issues)} 件\n")
    for iss in issues:
        print(f"  [{iss['type']}] {iss['cat']} / {iss['en']!r}")
        print(f"    {iss['note']}")
        if 'existing_file' in iss:
            print(f"    既存: {iss['existing_file']}.json の {iss['existing_en']!r}")
        print()
else:
    print("✅ 指摘事項なし")
```

---

## Step 4: 指摘事項の整理とユーザーへの提示

指摘事項を以下の3区分でまとめて出力する:

- **修正推奨**: 重複・明らかな誤分類（削除 or 移動が必要）
- **要注意（許容）**: 境界が曖昧だが運用上問題ない
- **問題なし**

修正推奨がある場合のみ、以下の形式でユーザーに確認する:

```
修正推奨 N 件を確認してください:

  1. <en>
     現在: <cat_key>
     問題: <note>
     推奨: <推奨対応>

この修正を適用しますか？ (yes / 個別指定 / skip)
```

---

## Step 5: 修正適用

ユーザーが承認した修正を適用する:

```python
import json
from pathlib import Path

cat_dir = Path("data/dictionary/categories")

def remove_from_category(cat_key: str, en: str) -> dict | None:
    """カテゴリから item を取り出して返す（ファイルを書き換える）。"""
    p = cat_dir / f"{cat_key}.json"
    with open(p) as f:
        d = json.load(f)
    target = next((i for i in d["items"] if i["en"].lower() == en.lower()), None)
    if target:
        d["items"] = [i for i in d["items"] if i["en"].lower() != en.lower()]
        with open(p, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    return target

def add_to_category(cat_key: str, item: dict, label_map: dict) -> None:
    """カテゴリに item を追加（ファイルを書き換える）。"""
    p = cat_dir / f"{cat_key}.json"
    item = dict(item)
    # ID プレフィックスを移動先に合わせて更新
    import re
    slug = re.sub(r'[^a-z0-9]+', '_', item["en"].lower()).strip('_')
    prefix_map = {
        "camera_comp": "cc", "body_features": "bf", "pose_action": "pa",
        "clothing": "cl", "accessories": "acc", "e621_pony": "e6",
    }
    prefix = prefix_map.get(cat_key, cat_key[:3])
    item["id"]   = f"{prefix}_{slug}"
    item["tags"] = [cat_key]

    if p.exists():
        with open(p) as f:
            d = json.load(f)
    else:
        d = {"key": cat_key, "label": label_map.get(cat_key, cat_key), "items": []}

    if not any(i["en"].lower() == item["en"].lower() for i in d["items"]):
        d["items"].append(item)
        d["items"].sort(key=lambda x: x["en"].lower())

    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"  → {item['en']!r} を {cat_key}.json に追加")

# 使い方例（修正ごとに呼び出す）:
# item = remove_from_category("accessories", "wings")
# if item: add_to_category("body_features", item, LABEL_MAP)
```

---

## Step 6: 再 compile

```bash
python3 tools/compile_dictionary.py
```

---

## Step 7: 修正後件数確認 & commit

```python
import json
from pathlib import Path
import subprocess

result = subprocess.run(
    ["git", "diff", "--name-only", "origin/main..HEAD"],
    capture_output=True, text=True
)
changed_keys = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

cat_dir = Path("data/dictionary/categories")
print("修正後カテゴリ件数:")
for key in sorted(changed_keys):
    p = cat_dir / f"{key}.json"
    if p.exists():
        with open(p) as f:
            d = json.load(f)
        print(f"  {key}: {len(d['items'])} 件")
```

```bash
git add data/dictionary/categories/ data/dictionary/compiled/ data/dictionary/expression.json app/app.js
git commit -m "fix(dictionary): review fixes for data2 import"
```

修正がない場合は commit をスキップする。

---

## Step 8: レポート出力

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  prompthub-review-import 完了レポート
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
指摘件数    : N 件 (修正推奨: N / 要注意: N / 問題なし)
削除した語彙: <en>, <en>, ...
移動した語彙: <en> (accessories → body_features), ...

修正後カテゴリ件数
  <cat_key>: N 件
  ...

compile     : ✅ safe.json / full.json → N items / N categories
merge 可否  : ✅ このまま /prompthub-merge-import を実行可能
            or ⚠️  以下の点を確認後に merge してください: ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 制約

- `git push` は **絶対にしない**
- 既存カテゴリ（変更ブランチ以外）のファイルを直接編集しない
- 修正推奨への対応はユーザーの承認後にのみ実行する
- compile エラーが出た場合は原因を特定し、最小修正で対応する
