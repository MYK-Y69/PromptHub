v2 データ・ツール・UI の現状を診断し、問題点・棚卸し情報をレポートする。

以下の手順を **そのまま** 実行してください（読み取り専用・変更なし）。

---

## Step 1: Git 状態

```bash
git branch --show-current
git status --short
git log --oneline -5
```

---

## Step 2: v2 データ構造の確認

```python
import json
from pathlib import Path

src      = Path("data/v2/tags.json")
compiled = Path("data/v2/compiled/tags.json")

# ── ソース JSON ────────────────────────────────────────────────
print("=" * 55)
print("  data/v2/tags.json")
print("=" * 55)

if not src.exists():
    print("  ⚠️  ファイルが存在しません")
else:
    with open(src) as f:
        d = json.load(f)

    print(f"  schema_version : {d.get('schema_version')}")
    print(f"  generated_at   : {d.get('generated_at', 'N/A')}")
    print(f"  total tags     : {d['count']}")
    print(f"  categories     : {len(d['categories'])}")
    print()

    for cat in d["categories"]:
        n_tags   = sum(len(s["tags"]) for s in cat["sections"])
        n_sec    = len(cat["sections"])
        src_url  = cat.get("source_url", "-")
        imp_at   = cat.get("imported_at", "-")
        print(f"  [{cat['id']:15s}] {cat['label']}")
        print(f"    tags      : {n_tags:5d}  sections: {n_sec}")
        print(f"    source    : {src_url}")
        print(f"    imported  : {imp_at}")
        print()
        for sec in cat["sections"]:
            n = len(sec["tags"])
            print(f"      {sec['id']:25s} {n:4d} tags  ({sec['label']})")
        print()

# ── compiled JSON ─────────────────────────────────────────────
print("=" * 55)
print("  data/v2/compiled/tags.json")
print("=" * 55)

if not compiled.exists():
    print("  ⚠️  ファイルが存在しません  → python3 tools/compile_v2.py を実行してください")
else:
    with open(compiled) as f:
        dc = json.load(f)
    print(f"  total tags     : {dc['count']}")
    print(f"  generated_at   : {dc.get('generated_at', 'N/A')}")
    match = "✅" if dc['count'] == d['count'] else "⚠️  ソースと件数が一致しません"
    print(f"  ソースと一致   : {match}")
```

---

## Step 3: target 属性の統計

```python
import json
from pathlib import Path
from collections import Counter

with open("data/v2/tags.json") as f:
    d = json.load(f)

TARGET_CATS = {"pose", "action"}

all_tags  = [(cat["id"], tag)
             for cat in d["categories"]
             for sec in cat["sections"]
             for tag in sec["tags"]]

total = len(all_tags)
target_counter = Counter(t.get("target") for _, t in all_tags)

print("=" * 55)
print("  target 属性 全体統計")
print("=" * 55)
print(f"  total tags: {total}")
for val, cnt in sorted(target_counter.items(), key=lambda x: -(x[1])):
    label = str(val) if val is not None else "null"
    pct = cnt / total * 100
    print(f"  {label:10s}: {cnt:5d}  ({pct:.1f}%)")

print()
print("  pose / action カテゴリの target 内訳:")
for cat in d["categories"]:
    if cat["id"] not in TARGET_CATS:
        continue
    tags = [t for s in cat["sections"] for t in s["tags"]]
    ctr = Counter(t.get("target") for t in tags)
    null_cnt = ctr.get(None, 0)
    print(f"  [{cat['id']}]  total={len(tags)}")
    for val, cnt in sorted(ctr.items(), key=lambda x: -(x[1])):
        label = str(val) if val is not None else "null"
        print(f"    {label:10s}: {cnt:5d}")
    if null_cnt > 0:
        pct = null_cnt / len(tags) * 100
        print(f"  → null が {null_cnt} 件 ({pct:.1f}%) 残っています（手動付与を検討）")
```

---

## Step 4: ツール確認

```python
import sys
from pathlib import Path

tools = {
    "tools/compile_v2.py"     : "v2 コンパイラ",
    "tools/import_v2.py"      : "v2 インポーター",
    "tools/parsers/base.py"   : "パーサー基底",
    "tools/parsers/sorenuts.py": "sorenuts パーサー",
    "tools/migrate_to_v2.py"  : "v1→v2 移行スクリプト",
}

print("=" * 55)
print("  ツール存在確認")
print("=" * 55)
for path, desc in tools.items():
    status = "✅" if Path(path).exists() else "❌"
    print(f"  {status} {path:35s} {desc}")

# パーサー import 確認
print()
sys.path.insert(0, "tools")
try:
    from parsers.base import get_parser
    print("  ✅ parsers.base import OK")
except Exception as e:
    print(f"  ❌ parsers.base import エラー: {e}")

try:
    from parsers.sorenuts import SorenutsParser
    print("  ✅ parsers.sorenuts import OK")
except Exception as e:
    print(f"  ❌ parsers.sorenuts import エラー: {e}")
```

---

## Step 5: sorenuts.jp 疎通確認

```python
import urllib.request, ssl, time

URLS = [
    ("https://sorenuts.jp/1954/", "表情・目の形"),
    ("https://sorenuts.jp/4566/", "ポーズ・体の特徴"),
    ("https://sorenuts.jp/4507/", "動作・行動"),
]

ctx = ssl._create_unverified_context()

print("=" * 55)
print("  sorenuts.jp 疎通確認（代表3ページ）")
print("=" * 55)

for url, label in URLS:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            status = f"✅ HTTP {resp.status}"
    except Exception as e:
        status = f"❌ {e}"
    print(f"  {status}  {label}")
    time.sleep(0.5)
```

---

## Step 6: 診断レポート

```python
import json
from pathlib import Path

with open("data/v2/tags.json") as f:
    d = json.load(f)

print()
print("━" * 55)
print("  prompthub-diagnose 診断サマリー")
print("━" * 55)
print(f"  v2/tags.json    : {d['count']} tags / {len(d['categories'])} categories")
print(f"  generated_at    : {d.get('generated_at', 'N/A')}")
print()
print("  推奨アクション:")
print("  ・sorenuts.jp が復旧したら /prompthub-import --all-sorenuts")
print("  ・ローカル確認は /prompthub-build")
print("  ・push は /prompthub-deploy")
print("━" * 55)
```

---

## 制約

- 読み取り専用。ファイル変更・git 操作は **一切しない**
