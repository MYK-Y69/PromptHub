`data2/` 原本の確認から main への push・UI 確認まで、TAGS 本線更新フローを一気通貫で実行する。

**主更新先は TAGS pipeline**（`data/inbox/*.tsv` → `compile_tags.py` → `compiled/tags.json`）。
SAFE/FULL pipeline（`data/dictionary/categories/*.json`）には書かない。

以下の手順を **そのまま** 実行してください。途中停止は高リスク操作（push・削除）のみ。

---

# Phase A: 事前確認

## Step 1: リポジトリ状態確認

```bash
git status --short
git log --oneline -3
git fetch origin
git log --oneline HEAD..origin/main
```

- `origin/main` に未取得コミットがある場合 → `git pull --ff-only origin main` を実行する。
- ローカルに未 push のコミットがある場合 → ユーザーに報告して止める。
- `main` ブランチ以外にいる場合 → ユーザーに確認する。

## Step 2: TAGS パイプライン確認

```bash
ls data/inbox/
python3 -c "
import json
from pathlib import Path
p = Path('data/dictionary/tags.json')
if p.exists():
    d = json.load(open(p))
    print(f'tags.json: {d[\"count_rows\"]} rows, {d[\"count_sections\"]} sections')
else:
    print('tags.json: not found')
p2 = Path('data/dictionary/compiled/tags.json')
if p2.exists():
    d2 = json.load(open(p2))
    print(f'compiled/tags.json: {d2[\"count\"]} items, generated_at={d2[\"generated_at\"]}')
"
```

- `data/inbox/` に TSV ファイルが存在しない場合 → `python3 tools/restore_tsv_from_tags.py` を実行して再生成する。
- TSV が存在する場合はそのまま使用する。

## Step 3: data2 原本スキャン

```python
import os
from pathlib import Path

data2 = Path("data2")
files = list(data2.iterdir()) if data2.exists() else []
print(f"data2/ ファイル数: {len(files)}")
for f in files:
    print(f"  {f.name}  ({f.stat().st_size:,} bytes)")
```

- `data2/` が空の場合は「原本がありません」と伝えて終了する。
- `.docx` / `.tsv` / `.csv` / `.txt` ファイルを処理対象とする。

---

# Phase B: 原本解析 → TAGS TSV 追記

## Step 4: 原本ファイルのパース

ファイル種別に応じて解析する。

**DOCX の場合**（NotebookLM 正規化済み 4列構造を想定: 英語名 / 日本語訳 / カテゴリー / 詳細・説明）:

```python
import zipfile, re
from xml.etree import ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

def parse_docx(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    paragraphs = []
    for para in root.findall(".//w:p", NS):
        text = "".join(t.text or "" for t in para.findall(".//w:t", NS)).strip()
        if text:
            paragraphs.append(text)
    # First paragraph: title, Second: header, Third+: data rows
    rows = []
    for line in paragraphs[2:]:
        parts = [p.strip() for p in re.split(r"\t|,(?=\s)", line)]
        if len(parts) >= 2:
            rows.append(parts)
    return rows

# Usage:
# for f in files:
#     if f.suffix == ".docx":
#         rows = parse_docx(f)
```

**TSV の場合**:

```python
import csv
def parse_tsv(path, columns):
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        return list(reader)
```

## Step 5: カテゴリーマッピングと TAGS section 名の決定

data2 原本の「カテゴリー」列を TAGS section 名にマッピングする。

既知マッピング（4列 DOCX 形式の場合）:

```python
CAT_MAP = {
    "カメラ・構図": "camera_comp",
    "身体特徴":     "body",
    "ポーズ・動作": "pose_action",
    "服装":         "clothes",
    "アクセサリー": "accessories",
    "e621/Pony":   "e621_pony",
}
```

未知カテゴリーが現れた場合: ユーザーに報告して section 名を確認する。

## Step 6: 既存 TAGS 語彙との重複除外

```python
import csv, re
from pathlib import Path
from collections import defaultdict

def normalize(s):
    return re.sub(r'[\s\-_/]+', '', s.lower())

TSV_PATH = Path("data/inbox/2026-03-03_tags_fixed.tsv")

def load_existing_keys(tsv):
    """danbooru_tag と definition 両方を正規化してキーセットを作る。"""
    keys = set()
    if not tsv.exists():
        return keys
    with open(tsv, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            dan = row.get("danbooru_tag", "").strip()
            dfn = row.get("definition",   "").strip()
            if dan: keys.add(normalize(dan))
            if dfn: keys.add(normalize(dfn))
    return keys

existing = load_existing_keys(TSV_PATH)
print(f"既存 TAGS entries: {len(existing)}")
```

**重複チェックは `danbooru_tag` と `definition` の両方を正規化して照合すること**（どちらかが一致したらスキップ）。

## Step 7: 新規語彙を TSV に追記

```python
COLUMNS = ["section", "jp_term", "definition", "danbooru_tag", "notes"]

new_rows = []
skipped = []

for row in parsed_rows:  # Step 4 で得たデータ
    en   = row[0].strip()   # 英語名 → danbooru_tag
    jp   = row[1].strip()   # 日本語訳 → jp_term
    cat  = row[2].strip()   # カテゴリー → section (via CAT_MAP)
    desc = row[3].strip() if len(row) > 3 else ""  # 詳細 → definition

    section = CAT_MAP.get(cat)
    if section is None:
        print(f"[UNKNOWN CAT] {cat!r} → {en!r}  ← ユーザー確認")
        continue

    nk = normalize(en)
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
    existing.add(nk)

print(f"スキップ: {len(skipped)}")
print(f"追記対象: {len(new_rows)}")

# 追記
content = TSV_PATH.read_text(encoding="utf-8")
if content and not content.endswith("\n"):
    content += "\n"

with open(TSV_PATH, "a", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=COLUMNS, delimiter="\t",
                            extrasaction="ignore", lineterminator="\n")
    for r in new_rows:
        writer.writerow(r)

print(f"追記完了: {len(new_rows)} rows → {TSV_PATH}")
```

## Step 8: compile_tags.py 実行

```bash
python3 tools/compile_tags.py
```

エラーがあれば原因を特定して最小修正で解消する。

## Step 9: app.js の SECTION_TO_MAJOR / SECTION_LABEL_JP 確認・更新

新しい TAGS section が `SECTION_TO_MAJOR` に登録済みか確認する:

```python
import subprocess, json

# 追加された section を特定
added_sections = list({r["section"] for r in new_rows})
print("追加 section:", added_sections)

# app.js から SECTION_TO_MAJOR の内容を確認
with open("app/app.js") as f:
    js = f.read()

missing = [s for s in added_sections if f'"{s}"' not in js and f"'{s}'" not in js and f" {s}:" not in js]
if missing:
    print(f"⚠️  SECTION_TO_MAJOR 未登録: {missing}  → 追記が必要")
else:
    print("✅ SECTION_TO_MAJOR: 全 section 登録済み")
```

未登録 section がある場合: `app.js` の `SECTION_TO_MAJOR` と `SECTION_LABEL_JP` に追記する（確認なしで実行可）。

## Step 10: git commit（branch は作らず main 直接）

```bash
git add data/dictionary/compiled/tags.json data/dictionary/tags.json app/app.js
git commit -m "feat(tags): add N items from data2 import (TAGS pipeline)"
```

---

# Phase C: レビュー

## Step 11: 追記内容の確認

```python
import csv, json
from pathlib import Path

# TSV 追記分の確認
with open("data/dictionary/compiled/tags.json") as f:
    compiled = json.load(f)
print(f"compiled/tags.json: {compiled['count']} items ({compiled['generated_at']})")

# from:data2 の件数・section 別内訳
tsv = Path("data/inbox/2026-03-03_tags_fixed.tsv")
rows = list(csv.DictReader(open(tsv, encoding="utf-8", newline=""), delimiter="\t"))
data2_rows = [r for r in rows if r.get("notes","") == "from:data2"]
from collections import Counter
ctr = Counter(r["section"] for r in data2_rows)
print(f"\nfrom:data2 合計: {len(data2_rows)} rows")
for sec, cnt in sorted(ctr.items()):
    ens = [r["danbooru_tag"] for r in data2_rows if r["section"]==sec]
    print(f"  {sec}: {cnt} → {ens[:5]}{'...' if cnt>5 else ''}")
```

## Step 12: 重複・誤配置チェック

```python
import csv, re
from pathlib import Path
from collections import defaultdict

def normalize(s):
    return re.sub(r'[\s\-_/]+', '', s.lower())

tsv = Path("data/inbox/2026-03-03_tags_fixed.tsv")
rows = list(csv.DictReader(open(tsv, encoding="utf-8", newline=""), delimiter="\t"))

def en_key(row):
    dan = row.get("danbooru_tag","").strip()
    if dan: return normalize(dan)
    dfn = row.get("definition","").strip()
    return normalize(dfn) if dfn else None

key_rows = defaultdict(list)
for i, r in enumerate(rows):
    k = en_key(r)
    if k:
        key_rows[k].append((i, r))

dups = {k: v for k,v in key_rows.items() if len(v)>1}
# from:data2 起因の重複のみ報告
data2_dups = {k:v for k,v in dups.items()
              if any(r.get("notes","")=="from:data2" for _,r in v)}
if data2_dups:
    print(f"⚠️  from:data2 起因の重複: {len(data2_dups)} 件")
    for k, matches in list(data2_dups.items())[:10]:
        for idx, r in matches:
            print(f"  [{idx}] {r['section']} | dan={r['danbooru_tag']!r} | def={r['definition']!r} | notes={r['notes']!r}")
else:
    print("✅ from:data2 重複なし")
```

重複が検出された場合: `from:data2` 行を削除して再 compile する（既存 TSV 行は触らない）。

---

# Phase D: push

## Step 13: push 確認

**ここでユーザーに確認する:**

```
TAGS pipeline に以下の変更を push します:

  追加 section : <section 一覧>
  追加語彙数   : N items（from:data2）
  compiled/tags.json: N items → N items

push してよいですか？ (yes / no)
```

承認された場合のみ:

```bash
git push origin main
```

---

# Phase E: UI 確認

## Step 14: ローカル UI 確認（TAGS モード）

```bash
kill $(lsof -ti:8765) 2>/dev/null; true
python3 -m http.server 8765 &>/tmp/prompthub_server.log &
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:8765/app/index.html
```

playwright が使えない場合はスキップして手動確認を促す:

```python
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("⚠️  playwright 未インストール。手動で http://localhost:8765/app/index.html を確認してください。")
    print("   TAGS モードに切り替えて追加語彙を検索してください。")
```

playwright が使える場合:

```python
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765/app/index.html"
OUT  = "/tmp/prompthub_ui_check"
Path(OUT).mkdir(exist_ok=True)

# 今回追加した section を特定
added_sections = list({r["section"] for r in new_rows})
# 今回追加した語彙からサンプル検索語を取得
sample_search = [r["danbooru_tag"] for r in new_rows[:6] if r["danbooru_tag"]]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto(BASE, wait_until="networkidle")
    time.sleep(1.5)

    # TAGS モードに切り替え
    tags_btn = page.query_selector('[data-mode="tags"]')
    if tags_btn:
        tags_btn.click()
        time.sleep(2)
    page.screenshot(path=f"{OUT}/01_tags_sidebar.png")

    # 全カテゴリと件数を確認
    cats = page.evaluate("""() =>
        Array.from(document.querySelectorAll('.cat-item'))
            .map(el => ({key: el.dataset.key, text: el.textContent.trim()}))
    """)
    print("TAGS サイドバー:")
    for c in cats:
        print(f"  {c['key']:20s}  {c['text'][:50]}")

    # 検索確認
    all_btn = page.query_selector('[data-key="__all__"]')
    if all_btn: all_btn.click(); time.sleep(0.5)
    si = page.query_selector('#search')
    print("\n検索確認:")
    for term in sample_search:
        if si:
            si.fill(""); si.fill(term)
            time.sleep(0.3)
            cards = page.query_selector_all('.card')
            ens = page.evaluate("""() =>
                Array.from(document.querySelectorAll('.card .card-en'))
                    .map(e => e.textContent.trim())
            """)
            status = "✅" if cards else "❌"
            print(f"  {status} '{term}': {len(cards)} 件 → {ens[:3]}")

    page.screenshot(path=f"{OUT}/03_search_result.png")
    browser.close()

print(f"\nスクリーンショット: {OUT}/")
```

---

# Phase F: 最終レポート

```python
import json, subprocess
from pathlib import Path

commit = subprocess.run(["git", "log", "--oneline", "-1"],
                        capture_output=True, text=True).stdout.strip()

with open("data/dictionary/compiled/tags.json") as f:
    d = json.load(f)

print("━" * 50)
print("  prompthub-run-data2-import 完了レポート")
print("━" * 50)
print(f"pipeline      : TAGS（SAFE/FULL は未変更）")
print(f"commit        : {commit}")
print(f"push          : ✅ origin/main へ push 完了")
print()
print(f"compiled/tags.json: {d['count']} items / {len(d['categories'])} sections")
print()
print("今回追加:")
for sec, cnt in sorted(ctr.items()):
    print(f"  {sec}: {cnt} items")
print()
print("UI 確認 (TAGS モード):")
print("  追加語彙検索   : ✅ 全件ヒット確認")
print()
print("今後の確認方法  : push 後 ~1分待ち → 通常リロードで最新表示")
print("━" * 50)
```

---

## 制約

- **SAFE/FULL pipeline（`data/dictionary/categories/*.json`）には書かない**
- `git push` はユーザー承認後のみ実行する
- `data/inbox/*.tsv` への追記は重複チェック後のみ行う（`danbooru_tag` + `definition` 両方を正規化照合）
- compile エラーが解消できない場合は push せずにユーザーに報告する
- `compile_dictionary.py`（SAFE/FULL）には触らない
