`data2/` の原本ファイルを読み込み、PromptHub 未収録語彙だけを抽出して現行アーキ（`data/dictionary/categories/` + compile 方式）へ追加する。

以下の手順を **そのまま** 実行してください（ユーザーに確認は取らない）:

---

## Step 1: リポジトリ・アーキ確認

```bash
git status --short
git log --oneline -3
git fetch origin
git log --oneline HEAD..origin/main
```

- `origin/main` に未取得コミットがある場合は `git pull --ff-only origin main` を実行する。
- ローカルに未 push のコミットがある場合は状況をユーザーに報告して止める。
- 現在のブランチが `main` でない場合はユーザーに確認する。

---

## Step 2: 現行アーキ確認

以下を確認して現行構成を把握する:

```bash
ls data/dictionary/categories/
python3 tools/compile_dictionary.py --help 2>/dev/null || head -20 tools/compile_dictionary.py
```

- `data/dictionary/categories/` に `.json` ファイルが存在することを確認する。
- `tools/compile_dictionary.py` が存在することを確認する。
- 存在しない場合はユーザーに報告して止める。

---

## Step 3: data2 スキャン & 原本特定

```bash
ls -lh data2/
```

以下の Python で読み込み候補を自動判定する:

```python
import zipfile, xml.etree.ElementTree as ET, csv, json, re
from pathlib import Path

data2_dir = Path("data2")
candidates = []

for f in sorted(data2_dir.iterdir()):
    ext = f.suffix.lower()
    if ext in (".docx", ".csv", ".tsv", ".txt", ".md"):
        candidates.append(f)

print(f"候補ファイル ({len(candidates)}件):")
for c in candidates:
    print(f"  {c.name}  ({c.stat().st_size // 1024} KB)")
```

- 候補が複数ある場合: 4列構造（英語名/日本語訳/カテゴリー/詳細）に最も近いファイルを優先する。
- DOCX を優先、次に CSV/TSV/TXT。
- `$ARGUMENTS` にファイルパスが指定されている場合はそれを使う。

---

## Step 4: 原本パース

採用したファイルの形式に応じて以下を実行する:

```python
import zipfile, xml.etree.ElementTree as ET, csv, json, re
from pathlib import Path

# ── DOCX 抽出 ────────────────────────────────────────────────────
def extract_docx_paragraphs(docx_path: Path) -> list[str]:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(docx_path) as z:
        with z.open("word/document.xml") as f:
            tree = ET.parse(f)
    root = tree.getroot()
    body = root.find(".//w:body", ns)
    result = []
    for p in body.findall(".//w:p", ns):
        texts = [t.text for r in p.findall(".//w:r", ns)
                 for t in r.findall("w:t", ns) if t.text]
        line = "".join(texts).strip()
        if line:
            result.append(line)
    return result

def parse_source_file(path: Path) -> list[dict]:
    """4列構造(en, jp, category, desc)として読み込む。ヘッダ行は自動スキップ。"""
    rows = []
    ext = path.suffix.lower()

    if ext == ".docx":
        paragraphs = extract_docx_paragraphs(path)
        # タイトル行・ヘッダ行を飛ばして CSV としてパース
        data_lines = []
        for line in paragraphs:
            r = list(csv.reader([line]))[0]
            # ヘッダ判定: 先頭セルが英語名または英単語ではない場合は飛ばす
            if len(r) >= 3 and r[0].strip() and not any(
                r[0].strip() in h for h in ["英語名", "English", "en", "term"]
            ):
                data_lines.append(r)
        raw_rows = data_lines
    elif ext in (".csv",):
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            raw_rows = [row for row in reader if row and row[0].strip()]
        # ヘッダ行スキップ
        if raw_rows and raw_rows[0][0].lower() in ("en", "english", "英語名", "term"):
            raw_rows = raw_rows[1:]
    elif ext in (".tsv",):
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.reader(f, delimiter="\t")
            raw_rows = [row for row in reader if row and row[0].strip()]
        if raw_rows and raw_rows[0][0].lower() in ("en", "english", "英語名", "term"):
            raw_rows = raw_rows[1:]
    else:
        raise ValueError(f"Unsupported format: {ext}")

    for r in raw_rows:
        if len(r) < 3:
            continue
        en = r[0].strip()
        jp = r[1].strip() if len(r) > 1 else ""
        cat = r[2].strip() if len(r) > 2 else ""
        desc = r[3].strip() if len(r) > 3 else ""
        if en and cat:
            rows.append({"en": en, "jp": jp, "cat_src": cat, "desc": desc})

    return rows

# ── 採用ファイルを指定してパース ──────────────────────────────────────────────
# (採用ファイルのパスを source_path に代入してから実行)
source_path = Path("data2") / "<採用ファイル名>"
source_rows = parse_source_file(source_path)
print(f"パース結果: {len(source_rows)} 行")
from collections import Counter
cat_counts = Counter(r["cat_src"] for r in source_rows)
for cat, n in cat_counts.most_common():
    print(f"  {cat}: {n}")
```

- 4列構造が確認できない（3列以下しかない等）場合はユーザーに報告して止める。

---

## Step 5: カテゴリマッピング & 重複判定

```python
import re, json
from pathlib import Path
from collections import defaultdict

# ── 既知カテゴリマッピング ────────────────────────────────────────
# 原本カテゴリ名(日本語) → PromptHub category key
CAT_MAP: dict[str, str] = {
    "カメラ・構図": "camera_comp",
    "身体特徴":     "body_features",
    "ポーズ・動作": "pose_action",
    "服装":         "clothing",
    "アクセサリー": "accessories",
    "e621/Pony":    "e621_pony",
    # ↑ 既知マッピング。新カテゴリが出たら review に回す。
}

LABEL_MAP: dict[str, str] = {
    "camera_comp":   "Camera Composition",
    "body_features": "Body Features",
    "pose_action":   "Poses & Actions",
    "clothing":      "Clothing",
    "accessories":   "Accessories",
    "e621_pony":     "e621/Pony",
}

# SECTION_TO_MAJOR への追加が必要なマッピング
SECTION_TO_MAJOR_ADDITIONS: dict[str, str] = {
    "camera_comp":   "camera",
    "body_features": "cloth",
    "pose_action":   "act",
    "clothing":      "cloth",   # 既存にあるが念のため
    "accessories":   "cloth",
    "e621_pony":     "style",
}

SECTION_LABEL_JP_ADDITIONS: dict[str, str] = {
    "camera_comp":   "カメラ構図",
    "body_features": "身体特徴",
    "pose_action":   "ポーズ・動作",
    "clothing":      "服装",
    "accessories":   "アクセサリー",
    "e621_pony":     "e621/Pony",
}

ID_PREFIX: dict[str, str] = {
    "camera_comp":   "cc",
    "body_features": "bf",
    "pose_action":   "pa",
    "clothing":      "cl",
    "accessories":   "acc",
    "e621_pony":     "e6",
}

def normalize(s: str) -> str:
    return re.sub(r'[\s\-_/]+', '', s.lower())

def to_slug(prefix: str, en: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '_', en.lower()).strip('_')
    return f"{prefix}_{slug}"

# ── 既存語彙ロード ────────────────────────────────────────────────
cat_dir = Path("data/dictionary/categories")
existing_en_lower: set[str] = set()
existing_en_norm: set[str] = set()

for jf in sorted(cat_dir.glob("*.json")):
    with open(jf) as f:
        data = json.load(f)
    for item in data.get("items", []):
        en = item.get("en", "")
        existing_en_lower.add(en.lower())
        existing_en_norm.add(normalize(en))

print(f"既存語彙数: {len(existing_en_lower)}")

# ── 分類 ─────────────────────────────────────────────────────────
auto_add: list[dict] = []
skip_existing: list[dict] = []
review_items: list[dict] = []   # 未知カテゴリ or 判定困難

for r in source_rows:
    en_lower = r["en"].lower()
    en_norm  = normalize(r["en"])
    cat_key  = CAT_MAP.get(r["cat_src"])

    # 重複判定
    if en_lower in existing_en_lower or en_norm in existing_en_norm:
        r["action"] = "skip_existing"
        skip_existing.append(r)
        continue

    # 未知カテゴリ
    if cat_key is None:
        r["action"] = "review"
        r["review_reason"] = f"未知カテゴリ: {r['cat_src']!r}"
        review_items.append(r)
        continue

    prefix = ID_PREFIX.get(cat_key, cat_key[:3])
    r["cat_key"]  = cat_key
    r["item_id"]  = to_slug(prefix, r["en"])
    r["action"]   = "add"
    auto_add.append(r)

print(f"\n分類結果:")
print(f"  自動追加可: {len(auto_add)}")
print(f"  スキップ (既存): {len(skip_existing)}")
print(f"  要確認: {len(review_items)}")
if review_items:
    print("\n  要確認詳細:")
    for r in review_items[:10]:
        print(f"    {r['en']!r:35} | {r['review_reason']}")
```

---

## Step 6: ブランチ作成

```bash
# ブランチ名: feat/data2-import-YYYYMMDD または $ARGUMENTS で指定
BRANCH="feat/data2-import-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
```

- `$ARGUMENTS` に branch 名が含まれている場合はそれを使う。
- 同名ブランチが既に存在する場合はサフィックスに `-2` を付ける。

---

## Step 7: category JSON 書き込み & app.js 更新

```python
import json, re
from pathlib import Path
from collections import defaultdict

cat_dir = Path("data/dictionary/categories")

# ── カテゴリ別に items をグループ化 ──────────────────────────────
by_cat: dict[str, list[dict]] = defaultdict(list)
for r in auto_add:
    item = {
        "id":   r["item_id"],
        "en":   r["en"],
        "jp":   r["jp"],
        "tags": [r["cat_key"]],
    }
    if r["desc"]:
        item["desc"] = r["desc"]
    by_cat[r["cat_key"]].append(item)

# ── 既存 category JSON にマージ or 新規作成 ───────────────────────
for cat_key, new_items in by_cat.items():
    out_path = cat_dir / f"{cat_key}.json"

    if out_path.exists():
        with open(out_path) as f:
            data = json.load(f)
        existing_ids = {i["id"] for i in data["items"]}
        existing_ens = {i["en"].lower() for i in data["items"]}
        added_count = 0
        for item in new_items:
            if item["id"] not in existing_ids and item["en"].lower() not in existing_ens:
                data["items"].append(item)
                existing_ids.add(item["id"])
                existing_ens.add(item["en"].lower())
                added_count += 1
        data["items"].sort(key=lambda x: x["en"].lower())
        print(f"[{cat_key}] +{added_count} 件追加 (既存 {len(data['items']) - added_count} 件)")
    else:
        label = LABEL_MAP.get(cat_key, cat_key.replace("_", " ").title())
        deduped = []
        seen_en: set[str] = set()
        for item in new_items:
            if item["en"].lower() not in seen_en:
                deduped.append(item)
                seen_en.add(item["en"].lower())
        deduped.sort(key=lambda x: x["en"].lower())
        data = {"key": cat_key, "label": label, "items": deduped}
        print(f"[{cat_key}] 新規作成 {len(deduped)} 件")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("\nJSON 書き込み完了")
```

次に `app/app.js` の `SECTION_TO_MAJOR` と `SECTION_LABEL_JP` に不足エントリを追加する:

```python
app_js_path = Path("app/app.js")
with open(app_js_path) as f:
    content = f.read()

modified = False

for key, major in SECTION_TO_MAJOR_ADDITIONS.items():
    pattern = rf'\b{re.escape(key)}\s*:'
    if not re.search(pattern, content):
        # clothing: "cloth" の行の直前に追加 (クラスタ末尾に挿入)
        insert_line = f'  {key}: "{major}",'
        # 既存 cloth グループ末尾を探して追加
        content = re.sub(
            r'(  clothing:\s*"cloth",\s*clothes:\s*"cloth",)',
            lambda m: m.group(0) + f'\n  {key}: "{major}",',
            content
        )
        # clothing 行が既に置換対象と一致する場合はスキップ（重複防止）
        modified = True
        print(f"SECTION_TO_MAJOR に追加: {key} -> {major}")

for key, label_jp in SECTION_LABEL_JP_ADDITIONS.items():
    pattern = rf'"{re.escape(key)}":\s*"'
    if not re.search(pattern, content):
        # "clothes": 行の直後に追加
        content = content.replace(
            '"clothes":     "服装",',
            f'"clothes":     "服装",\n  "{key}":      "{label_jp}",'
        )
        modified = True
        print(f"SECTION_LABEL_JP に追加: {key} -> {label_jp}")

if modified:
    with open(app_js_path, "w") as f:
        f.write(content)
    print("app.js 更新完了")
else:
    print("app.js 変更不要（既に全エントリ存在）")
```

---

## Step 8: compile

```bash
python3 tools/compile_dictionary.py
```

エラーが出た場合（重複 ID 等）は原因を特定し最小修正で解消する。大規模改修は行わない。

---

## Step 9: git add & commit

```bash
git add data/dictionary/categories/ data/dictionary/compiled/ data/dictionary/expression.json app/app.js
git status --short
git commit -m "feat(dictionary): import data2 terms ($(date +%Y-%m-%d))"
```

---

## Step 10: レポート出力

以下のフォーマットで出力する:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  prompthub-import-data2 完了レポート
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
採用原本    : <ファイル名>
原本総行数  : N 行
ブランチ    : feat/data2-import-YYYYMMDD

分類結果
  自動追加  : N 件
  スキップ  : N 件（既存重複）
  要確認    : N 件（未知カテゴリ等）

カテゴリ別追加件数
  camera_comp   : N
  pose_action   : N
  body_features : N
  clothing      : N
  accessories   : N
  e621_pony     : N

compile     : ✅ safe.json / full.json → N items / N categories
次のステップ: /prompthub-review-import を実行してレビューへ

要確認項目
  <要確認がある場合のみ列挙>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 制約

- `git push` は **絶対にしない**（merge まで push しない）
- `data/dictionary/categories/` 以外の既存ファイルを直接削除・置換しない
- 既存アイテムの上書き・削除は **しない**
- 既存アーキ（SAFE/FULL compile 方式）を壊す大規模改修は **しない**
- TAGS パイプライン（`data/inbox/*.tsv` / `compile_tags.py`）には触らない
- 不明点は repo を読んで確定する。質問は最小限にする
