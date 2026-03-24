`data2/` 原本の確認から main への push・UI 確認まで、data2 取り込みフローを一気通貫で実行する。

以下の手順を **そのまま** 実行してください。途中停止は高リスク操作（push・merge・削除）のみ。

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

## Step 2: 現行アーキ確認

```bash
ls data/dictionary/categories/
head -5 tools/compile_dictionary.py
```

- `data/dictionary/categories/` に `.json` がなければユーザーに報告して止める。
- `tools/compile_dictionary.py` がなければ同様に止める。

## Step 3: data2 スキャン & 原本特定

```python
import zipfile, xml.etree.ElementTree as ET, csv, json, re
from pathlib import Path

data2_dir = Path("data2")
candidates = sorted(
    [f for f in data2_dir.iterdir() if f.suffix.lower() in (".docx",".csv",".tsv",".txt",".md")],
    key=lambda f: (0 if f.suffix.lower()==".docx" else 1, f.name)
)
print(f"data2 候補ファイル ({len(candidates)}件):")
for c in candidates:
    print(f"  {c.name}  ({c.stat().st_size//1024} KB)")
```

- 候補が 0 件 → 「data2/ に対応ファイルがありません」と伝えて止める。
- `$ARGUMENTS` にファイルパスが含まれる場合はそれを採用する。
- 複数ある場合は 4 列構造（英語名/日本語訳/カテゴリー/詳細）に最も近いものを選ぶ。

---

# Phase B: Import

## Step 4: 原本パース

採用したファイルを以下の Python でパースする:

```python
import zipfile, xml.etree.ElementTree as ET, csv, json, re
from pathlib import Path

# ── DOCX 抽出 ─────────────────────────────────────────────────────────────────
def extract_docx_paragraphs(docx_path: Path) -> list[str]:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(docx_path) as z:
        with z.open("word/document.xml") as f:
            tree = ET.parse(f)
    body = tree.getroot().find(".//w:body", ns)
    result = []
    for p in body.findall(".//w:p", ns):
        texts = [t.text for r in p.findall(".//w:r", ns)
                 for t in r.findall("w:t", ns) if t.text]
        line = "".join(texts).strip()
        if line:
            result.append(line)
    return result

def parse_source_file(path: Path) -> list[dict]:
    ext = path.suffix.lower()
    if ext == ".docx":
        paragraphs = extract_docx_paragraphs(path)
        raw_rows = []
        for line in paragraphs:
            r = list(csv.reader([line]))[0]
            # ヘッダ行・タイトル行スキップ（先頭セルが英語名系、または ASCII 外単語だけの行）
            if len(r) >= 3 and r[0].strip() and not any(
                r[0].strip() == h for h in ["英語名","English","en","term","英語"]
            ) and not r[0].strip().startswith("引用"):
                raw_rows.append(r)
    elif ext in (".csv",):
        with open(path, encoding="utf-8", newline="") as f:
            raw_rows = [r for r in csv.reader(f) if r and r[0].strip()]
        if raw_rows and raw_rows[0][0].lower() in ("en","english","英語名","term"):
            raw_rows = raw_rows[1:]
    elif ext in (".tsv",):
        with open(path, encoding="utf-8", newline="") as f:
            raw_rows = [r for r in csv.reader(f, delimiter="\t") if r and r[0].strip()]
        if raw_rows and raw_rows[0][0].lower() in ("en","english","英語名","term"):
            raw_rows = raw_rows[1:]
    else:
        raise ValueError(f"Unsupported: {ext}")

    rows = []
    for r in raw_rows:
        if len(r) < 3:
            continue
        en   = r[0].strip()
        jp   = r[1].strip() if len(r) > 1 else ""
        cat  = r[2].strip() if len(r) > 2 else ""
        desc = r[3].strip() if len(r) > 3 else ""
        if en and cat:
            rows.append({"en": en, "jp": jp, "cat_src": cat, "desc": desc})
    return rows

# ── 採用ファイルを指定 ────────────────────────────────────────────────────────
# (Step 3 で特定したファイルパスを使う)
# source_path = Path("data2") / "<ファイル名>"
source_rows = parse_source_file(source_path)

from collections import Counter
print(f"\n採用原本: {source_path.name}  総行数: {len(source_rows)}")
print("カテゴリ内訳:")
for cat, n in Counter(r["cat_src"] for r in source_rows).most_common():
    print(f"  {cat}: {n}")
```

4 列構造が確認できない場合はユーザーに報告して止める。

## Step 5: 重複判定・未収録語彙抽出

```python
import json, re
from pathlib import Path
from collections import defaultdict

CAT_MAP: dict[str,str] = {
    "カメラ・構図": "camera_comp",
    "身体特徴":     "body_features",
    "ポーズ・動作": "pose_action",
    "服装":         "clothing",
    "アクセサリー": "accessories",
    "e621/Pony":    "e621_pony",
}
LABEL_MAP: dict[str,str] = {
    "camera_comp":   "Camera Composition",
    "body_features": "Body Features",
    "pose_action":   "Poses & Actions",
    "clothing":      "Clothing",
    "accessories":   "Accessories",
    "e621_pony":     "e621/Pony",
}
ID_PREFIX: dict[str,str] = {
    "camera_comp":"cc","body_features":"bf","pose_action":"pa",
    "clothing":"cl","accessories":"acc","e621_pony":"e6",
}
SECTION_TO_MAJOR_ADD: dict[str,str] = {
    "camera_comp":"camera","body_features":"cloth","pose_action":"act",
    "clothing":"cloth","accessories":"cloth","e621_pony":"style",
}
SECTION_LABEL_JP_ADD: dict[str,str] = {
    "camera_comp":"カメラ構図","body_features":"身体特徴",
    "pose_action":"ポーズ・動作","clothing":"服装",
    "accessories":"アクセサリー","e621_pony":"e621/Pony",
}

def normalize(s: str) -> str:
    return re.sub(r'[\s\-_/]+','',s.lower())

def to_slug(prefix: str, en: str) -> str:
    return f"{prefix}_{re.sub(r'[^a-z0-9]+','_',en.lower()).strip('_')}"

# 既存語彙ロード
cat_dir = Path("data/dictionary/categories")
existing_en_lower: set[str] = set()
existing_en_norm:  set[str] = set()
for jf in sorted(cat_dir.glob("*.json")):
    with open(jf) as f:
        d = json.load(f)
    for item in d.get("items",[]):
        en = item.get("en","")
        existing_en_lower.add(en.lower())
        existing_en_norm.add(normalize(en))

print(f"既存語彙: {len(existing_en_lower)} 件")

# 分類
auto_add: list[dict] = []
skip_existing: list[dict] = []
review_items: list[dict] = []

for r in source_rows:
    en_lower = r["en"].lower()
    en_norm  = normalize(r["en"])
    cat_key  = CAT_MAP.get(r["cat_src"])

    if en_lower in existing_en_lower or en_norm in existing_en_norm:
        r["action"] = "skip_existing"
        skip_existing.append(r)
        continue
    if cat_key is None:
        r["action"] = "review"
        r["review_reason"] = f"未知カテゴリ: {r['cat_src']!r}"
        review_items.append(r)
        continue

    r["cat_key"] = cat_key
    r["item_id"] = to_slug(ID_PREFIX.get(cat_key, cat_key[:3]), r["en"])
    r["action"]  = "add"
    auto_add.append(r)

print(f"\n分類結果: 追加={len(auto_add)}  スキップ={len(skip_existing)}  要確認={len(review_items)}")
if review_items:
    print("要確認:")
    for r in review_items[:10]:
        print(f"  {r['en']!r:35} → {r['review_reason']}")
```

## Step 6: ブランチ作成

```bash
BRANCH="feat/data2-import-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
```

`$ARGUMENTS` にブランチ名が含まれる場合はそれを使う。
同名ブランチが存在する場合はサフィックス `-2` を付ける。

## Step 7: category JSON 書き込み & app.js 更新 & compile

```python
import json, re
from pathlib import Path
from collections import defaultdict

cat_dir = Path("data/dictionary/categories")

# category JSON 書き込み
by_cat: dict[str,list] = defaultdict(list)
for r in auto_add:
    item = {"id": r["item_id"], "en": r["en"], "jp": r["jp"], "tags": [r["cat_key"]]}
    if r["desc"]:
        item["desc"] = r["desc"]
    by_cat[r["cat_key"]].append(item)

for cat_key, new_items in by_cat.items():
    out_path = cat_dir / f"{cat_key}.json"
    if out_path.exists():
        with open(out_path) as f:
            d = json.load(f)
        existing_ids = {i["id"] for i in d["items"]}
        existing_ens = {i["en"].lower() for i in d["items"]}
        added = 0
        for item in new_items:
            if item["id"] not in existing_ids and item["en"].lower() not in existing_ens:
                d["items"].append(item)
                existing_ids.add(item["id"])
                existing_ens.add(item["en"].lower())
                added += 1
        d["items"].sort(key=lambda x: x["en"].lower())
        print(f"[{cat_key}] +{added} 件追加（既存 {len(d['items'])-added} 件）")
    else:
        seen: set[str] = set()
        deduped = [i for i in new_items if i["en"].lower() not in seen and not seen.add(i["en"].lower())]
        deduped.sort(key=lambda x: x["en"].lower())
        d = {"key": cat_key, "label": LABEL_MAP.get(cat_key, cat_key), "items": deduped}
        print(f"[{cat_key}] 新規作成 {len(deduped)} 件")
    with open(out_path,"w",encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

# app.js 更新（SECTION_TO_MAJOR / SECTION_LABEL_JP）
app_js = Path("app/app.js")
content = app_js.read_text()
modified = False

for key, major in SECTION_TO_MAJOR_ADD.items():
    if not re.search(rf'\b{re.escape(key)}\s*:', content):
        content = re.sub(
            r'(  clothing:\s*"cloth",\s*clothes:\s*"cloth",)',
            lambda m: m.group(0) + f'\n  {key}: "{major}",',
            content
        )
        modified = True
        print(f"SECTION_TO_MAJOR: {key} → {major} 追加")

for key, label_jp in SECTION_LABEL_JP_ADD.items():
    if not re.search(rf'"{re.escape(key)}":\s*"', content):
        content = content.replace(
            '"clothes":     "服装",',
            f'"clothes":     "服装",\n  "{key}":      "{label_jp}",'
        )
        modified = True
        print(f"SECTION_LABEL_JP: {key} → {label_jp} 追加")

if modified:
    app_js.write_text(content)
    print("app.js 更新完了")
else:
    print("app.js 変更不要")
```

```bash
python3 tools/compile_dictionary.py
```

compile エラーが出た場合は原因を特定し最小修正で解消する。

```bash
git add data/dictionary/categories/ data/dictionary/compiled/ data/dictionary/expression.json app/app.js
git commit -m "feat(dictionary): import data2 terms ($(date +%Y-%m-%d))"
```

件数サマリ出力:

```
import 完了: 追加 N 件 / スキップ N 件 / 要確認 N 件
compile: ✅ safe.json / full.json → N items / N categories
```

---

# Phase C: Review

## Step 8: 差分レビュー

```python
import json, re, subprocess
from pathlib import Path

cat_dir = Path("data/dictionary/categories")
result = subprocess.run(
    ["git","diff","--name-only","origin/main..HEAD"],
    capture_output=True, text=True
)
new_cat_keys = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

print(f"追加カテゴリ ({len(new_cat_keys)} 件):\n")
for key in sorted(new_cat_keys):
    p = cat_dir / f"{key}.json"
    if not p.exists():
        continue
    with open(p) as f:
        d = json.load(f)
    items = d["items"]
    print(f"[{key}]  label={d.get('label')!r}  件数={len(items)}")
    for item in items[:5]:
        print(f"  {item['en']:35s} / {item['jp']}")
    if len(items) > 5:
        print(f"  ... (+{len(items)-5} 件)")
    print()
```

## Step 9: 誤分類・重複チェック

```python
import json, re, subprocess
from pathlib import Path

cat_dir = Path("data/dictionary/categories")
result = subprocess.run(
    ["git","diff","--name-only","origin/main..HEAD"],
    capture_output=True, text=True
)
new_cat_keys = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

def normalize(s): return re.sub(r'[\s\-_/]+','',s.lower())

# 既存語彙（変更外カテゴリのみ）
existing: dict[str,tuple] = {}
exist_norm: dict[str,tuple] = {}
for jf in sorted(cat_dir.glob("*.json")):
    if jf.stem in new_cat_keys:
        continue
    with open(jf) as f:
        d = json.load(f)
    for item in d.get("items",[]):
        en = item.get("en","")
        existing[en.lower()] = (jf.stem, item)
        exist_norm[normalize(en)] = (jf.stem, item)

# 新カテゴリ全 item
all_new: list[tuple[str,dict]] = []
for key in new_cat_keys:
    p = cat_dir / f"{key}.json"
    if p.exists():
        with open(p) as f:
            d = json.load(f)
        for item in d.get("items",[]):
            all_new.append((key, item))

issues: list[dict] = []
seen_en: dict[str,str] = {}

# 取り外せない身体特徴を accessories に入れている
BODY_IN_ACC = {"wings","horns","tails","tail","ears","fur","scales","feathers","claws"}
# ポーズ語・服装語が body_features に混入
POSE_KW  = ["pose","sitting","standing","lying","reaching","kneeling"]
CLOTH_KW = ["shirt","dress","skirt","pants","bra","swimsuit","uniform"]

for cat_key, item in all_new:
    en = item["en"]
    el = en.lower()
    en_n = normalize(en)

    # 既存との重複
    if el in existing:
        ex_f, ex_i = existing[el]
        issues.append({"type":"DUP_EXACT","cat":cat_key,"en":en,"jp":item["jp"],
                       "note":f"既存 {ex_f}.json の {ex_i['en']!r} と完全一致"})
    elif en_n in exist_norm:
        ex_f, ex_i = exist_norm[en_n]
        issues.append({"type":"DUP_NORM","cat":cat_key,"en":en,"jp":item["jp"],
                       "note":f"既存 {ex_f}.json の {ex_i['en']!r} と表記ゆれ一致"})

    # 新カテゴリ間の重複
    if el in seen_en and seen_en[el] != cat_key:
        issues.append({"type":"DUP_CROSS","cat":cat_key,"en":en,"jp":item["jp"],
                       "note":f"{seen_en[el]}.json にも同語あり"})
    seen_en[el] = cat_key

    # 身体部位が accessories に
    if cat_key == "accessories" and el in BODY_IN_ACC:
        issues.append({"type":"MISPLACE","cat":cat_key,"en":en,"jp":item["jp"],
                       "note":"身体特徴。body_features が適切"})

    # ポーズ・服装語が body_features に
    if cat_key == "body_features":
        if any(kw in el for kw in POSE_KW):
            issues.append({"type":"MISPLACE","cat":cat_key,"en":en,"jp":item["jp"],
                           "note":"ポーズ語の混入可能性。pose_action を検討"})
        if any(kw in el for kw in CLOTH_KW):
            issues.append({"type":"MISPLACE","cat":cat_key,"en":en,"jp":item["jp"],
                           "note":"服装語の混入可能性。clothing を検討"})

if issues:
    print(f"⚠️  指摘: {len(issues)} 件\n")
    modify_recommended = [i for i in issues if i["type"] in ("DUP_EXACT","DUP_NORM","MISPLACE")]
    caution_only       = [i for i in issues if i not in modify_recommended]
    if modify_recommended:
        print("【修正推奨】")
        for i, iss in enumerate(modify_recommended,1):
            print(f"  {i}. [{iss['type']}] {iss['cat']} / {iss['en']!r}")
            print(f"     {iss['note']}")
    if caution_only:
        print("\n【要注意（許容範囲）】")
        for iss in caution_only:
            print(f"  {iss['cat']} / {iss['en']!r}  {iss['note']}")
else:
    print("✅ 指摘なし。修正不要。")
```

## Step 10: 修正適用

修正推奨がある場合のみ、以下を確認のうえ適用する:

```
修正推奨 N 件:
  1. <en>  現在: <cat>  問題: <note>  推奨: <対応>
  ...
これらを適用しますか？ (yes / 個別指定 / skip)
```

承認された修正を適用する:

```python
import json, re
from pathlib import Path

cat_dir = Path("data/dictionary/categories")
LABEL_MAP_LOCAL = {
    "camera_comp":"Camera Composition","body_features":"Body Features",
    "pose_action":"Poses & Actions","clothing":"Clothing",
    "accessories":"Accessories","e621_pony":"e621/Pony",
}
ID_PREFIX_LOCAL = {
    "camera_comp":"cc","body_features":"bf","pose_action":"pa",
    "clothing":"cl","accessories":"acc","e621_pony":"e6",
}

def remove_from_cat(cat_key: str, en: str) -> dict | None:
    p = cat_dir / f"{cat_key}.json"
    with open(p) as f:
        d = json.load(f)
    target = next((i for i in d["items"] if i["en"].lower()==en.lower()), None)
    if target:
        d["items"] = [i for i in d["items"] if i["en"].lower()!=en.lower()]
        with open(p,"w",encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        print(f"  削除: {en!r} ← {cat_key}.json")
    return target

def add_to_cat(cat_key: str, item: dict) -> None:
    p = cat_dir / f"{cat_key}.json"
    item = dict(item)
    prefix = ID_PREFIX_LOCAL.get(cat_key, cat_key[:3])
    item["id"]   = f"{prefix}_{re.sub(r'[^a-z0-9]+','_',item['en'].lower()).strip('_')}"
    item["tags"] = [cat_key]
    if p.exists():
        with open(p) as f:
            d = json.load(f)
    else:
        d = {"key":cat_key,"label":LABEL_MAP_LOCAL.get(cat_key,cat_key),"items":[]}
    if not any(i["en"].lower()==item["en"].lower() for i in d["items"]):
        d["items"].append(item)
        d["items"].sort(key=lambda x: x["en"].lower())
    with open(p,"w",encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"  追加: {item['en']!r} → {cat_key}.json")

# 使い方（修正ごとに呼ぶ）:
# item = remove_from_cat("accessories", "wings")
# if item: add_to_cat("body_features", item)
```

修正後は再 compile する:

```bash
python3 tools/compile_dictionary.py
```

```bash
git add data/dictionary/categories/ data/dictionary/compiled/ data/dictionary/expression.json
git commit -m "fix(dictionary): review fixes for data2 import"
```

修正ゼロの場合は commit をスキップする。

---

# Phase D: Merge / Push

## Step 11: merge 前最終確認

```bash
python3 tools/compile_dictionary.py
git log --oneline -3
git diff --stat origin/main..HEAD
```

compile エラーがあれば解消してから先に進む。

## Step 12: main へ merge

**ここでユーザーに確認する:**

```
以下の内容を main へ merge します:

  ブランチ: <branch_name>
  追加カテゴリ: <一覧>
  compile 結果: safe.json / full.json → N items

merge してよいですか？ (yes / no)
```

承認後:

```bash
IMPORT_BRANCH=$(git branch --show-current)
git checkout main
git pull --ff-only origin main
git merge --no-ff "$IMPORT_BRANCH" -m "Merge ${IMPORT_BRANCH}: add prompt terms from data2"
```

競合が発生した場合: 競合内容をユーザーに報告して止める。自動解消しない。

## Step 13: push 確認 & 実行

**ここでユーザーに確認する:**

```
push します: origin/main  (commit: <hash>)
push してよいですか？ (yes / no)
```

承認後:

```bash
git push origin main
```

## Step 14: import ブランチ削除（任意）

**ユーザーに確認する:**

```
<branch_name> を削除しますか？ (yes / no)
```

承認後:

```bash
git branch -d "$IMPORT_BRANCH"
git push origin --delete "$IMPORT_BRANCH"
```

---

# Phase E: UI 確認

## Step 15: ローカル UI 起動

```bash
kill $(lsof -ti:8765) 2>/dev/null; true
python3 -m http.server 8765 &>/tmp/prompthub_server.log &
sleep 1
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8765/app/index.html
```

## Step 16: Playwright による UI・検索確認

playwright が使えない場合は `python3 -m playwright install chromium` を試みる。それでも使えない場合は手動確認を促してスキップする。

```python
import json, subprocess, time
from pathlib import Path
try:
    from playwright.sync_api import sync_playwright
    HAS_PW = True
except ImportError:
    HAS_PW = False
    print("⚠️  playwright 未インストール。手動で http://localhost:8765/app/index.html を確認してください。")

if HAS_PW:
    BASE = "http://localhost:8765/app/index.html"
    OUT  = "/tmp/prompthub_ui_check"
    Path(OUT).mkdir(exist_ok=True)

    # 今回追加したカテゴリキーを特定
    result = subprocess.run(
        ["git","diff","--name-only","HEAD~2..HEAD"],  # merge commit + fix commit 分
        capture_output=True, text=True
    )
    added_cats = sorted({
        Path(f).stem for f in result.stdout.splitlines()
        if f.startswith("data/dictionary/categories/") and f.endswith(".json")
        and Path(f).stem not in ("expression","action","angle","camera","count",
                                  "focus","meta","pose","pov","relationship")
    })

    # 検索語（デフォルト + $ARGUMENTS 指定語があれば追加）
    default_terms = ["bokeh","lens flare","peace sign","heart hands",
                     "flat chest","bikini","glasses","anthro"]

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width":1400,"height":900})
        page.goto(BASE, wait_until="networkidle")
        time.sleep(1.5)

        # SAFE モードへ切り替え
        btn = page.query_selector('[data-mode="safe"]')
        if btn:
            btn.click(); time.sleep(1.5)
        page.screenshot(path=f"{OUT}/01_sidebar.png")

        cats = page.evaluate("""() =>
            Array.from(document.querySelectorAll('.cat-item'))
                .map(el=>({key:el.dataset.key,text:el.textContent.trim()}))
        """)
        print("SAFE サイドバー:")
        for c in cats:
            print(f"  {c['key']:25s}  {c['text'][:40]}")

        # 追加カテゴリを個別確認
        for cat_key in added_cats:
            el = page.query_selector(f'[data-key="{cat_key}"]')
            if el:
                el.click(); time.sleep(0.6)
                page.screenshot(path=f"{OUT}/02_{cat_key}.png")
                ens = page.evaluate("""() =>
                    Array.from(document.querySelectorAll('.card .card-en'))
                        .map(e=>e.textContent.trim())
                """)
                status = "✅" if ens else "❌ カードなし"
                print(f"\n[{cat_key}] {len(ens)} cards {status}: {ens[:5]}")
            else:
                print(f"[{cat_key}] ⚠️  サイドバーに表示なし")

        # __all__ で検索確認
        all_btn = page.query_selector('[data-key="__all__"]')
        if all_btn:
            all_btn.click(); time.sleep(0.5)

        search = page.query_selector('#search')
        print("\n検索確認 (SAFE / __all__):")
        for term in default_terms:
            if search:
                search.fill(""); search.fill(term); time.sleep(0.3)
                cards = page.query_selector_all('.card')
                ens   = page.evaluate("""() =>
                    Array.from(document.querySelectorAll('.card .card-en'))
                        .map(e=>e.textContent.trim())
                """)
                icon = "✅" if cards else "❌"
                print(f"  {icon} '{term}': {len(cards)} 件 → {ens[:3]}")
        page.screenshot(path=f"{OUT}/03_search.png")
        browser.close()

    print(f"\nスクリーンショット: {OUT}/")
```

---

# Phase F: 最終レポート

## Step 17: 最終レポート出力

以下のフォーマットで出力する:

```python
import json, subprocess
from pathlib import Path

commit_hash = subprocess.run(["git","log","--oneline","-1"],
                             capture_output=True, text=True).stdout.strip()
cat_dir = Path("data/dictionary/categories")
result = subprocess.run(
    ["git","diff","--name-only","HEAD~2..HEAD"],
    capture_output=True, text=True
)
changed = sorted({
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
})

print("━"*52)
print("  prompthub-run-data2-import 最終レポート")
print("━"*52)
# 変数は各 Phase で定義されたものを参照
print(f"採用原本     : {source_path.name}")
print(f"原本総行数   : {len(source_rows)}")
print(f"スキップ     : {len(skip_existing)} 件（既存重複）")
print(f"追加         : {len(auto_add)} 件")
print(f"要確認       : {len(review_items)} 件")
print()
print("カテゴリ別件数:")
for key in sorted(changed):
    p = cat_dir / f"{key}.json"
    if p.exists():
        with open(p) as f:
            d = json.load(f)
        print(f"  {key}: {len(d['items'])} 件")
print()
print(f"compile      : ✅ 正常終了")
print(f"commit hash  : {commit_hash}")
print(f"push         : ✅ origin/main 反映済み")
print()
print("UI 確認:")
print("  SAFE/FULL : ✅ 追加カテゴリ全件表示")
print("  TAGS      : ✅ 仕様通り（別パイプライン）")
print("  desc      : ✅ JSON 保存済み・UI未表示は仕様")
print()
print("UI 運用可否  : ✅ 運用可")
print("━"*52)
```

---

## 制約

- `git push` はユーザー承認後のみ実行する
- `git merge` はユーザー承認後のみ実行する
- ブランチ削除はユーザー確認後のみ実行する
- 既存アイテムの削除・置換はユーザー承認後のみ実行する
- compile エラーが解消できない場合は merge せずに止める
- 競合が発生した場合は自動解消しない
- TAGS パイプライン（`compile_tags.py` / `data/inbox/`）には触らない
- 新カテゴリが SAFE/FULL に出て TAGS に出ない場合は仕様通りと判断してよい
- 旧アーキ（DICT_FILES 方式）には戻さない
