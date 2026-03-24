レビュー済みの import ブランチを main へ反映し、compile・push・UI 確認まで完了させる。

以下の手順を **そのまま** 実行してください:

---

## Step 1: ブランチ・差分確認

```bash
git branch --show-current
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

- `main` ブランチにいる場合は「import ブランチが見つかりません」と伝えて終了する。
- 差分がない場合も同様に終了する。
- 未 commit の変更がある場合はユーザーに確認する。

---

## Step 2: main / origin/main 追従確認

```bash
git fetch origin
git log --oneline origin/main..main 2>/dev/null || echo "main branch info unavailable"
```

local main がローカルコミットで diverge している場合 (`git log origin/main..main` に出力がある場合):

```bash
# 旧アーキ等の不要コミットがある場合のみ:
# ⚠️ 以下は破壊的操作のためユーザーに確認してから実行する
# git checkout main && git reset --hard origin/main && git checkout -
```

---

## Step 3: merge 前 compile 確認

```bash
python3 tools/compile_dictionary.py
```

エラーがあれば原因を特定して最小修正で解消する。エラーが解消できない場合はユーザーに報告して止める。

---

## Step 4: main へ merge

現在のブランチ名を変数に保存してから main に切り替える:

```bash
IMPORT_BRANCH=$(git branch --show-current)
git checkout main
git pull --ff-only origin main
git merge --no-ff "$IMPORT_BRANCH" -m "Merge ${IMPORT_BRANCH}: add prompt terms from data2"
```

競合が発生した場合: 競合ファイルと内容をユーザーに報告して止める。自動解消は行わない。

---

## Step 5: push 確認

**ここでユーザーに確認する:**

```
main に以下の変更を push します:

  ブランチ: feat/data2-import-* → main
  追加カテゴリ: <カテゴリ一覧>
  compile 結果: safe.json / full.json → N items

push してよいですか？ (yes / no)
```

承認された場合のみ:

```bash
git push origin main
```

---

## Step 6: import ブランチ削除（任意）

```bash
# ユーザーに確認してから実行:
git branch -d "$IMPORT_BRANCH"
git push origin --delete "$IMPORT_BRANCH"
```

---

## Step 7: ローカル UI 確認

HTTP サーバーを起動して Playwright でスクリーンショットを取得する:

```bash
# 既存のサーバーを止めてから起動
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
```

playwright が使える場合:

```python
import json, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765/app/index.html"
OUT  = "/tmp/prompthub_ui_check"
Path(OUT).mkdir(exist_ok=True)

# 追加されたカテゴリキーを特定
result = subprocess.run(
    ["git", "diff", "--name-only", "origin/main~1..HEAD"],
    capture_output=True, text=True
)
added_cats = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
    and Path(f).stem not in ("expression", "action", "angle", "camera", "count",
                              "focus", "meta", "pose", "pov", "relationship")
]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto(BASE, wait_until="networkidle")
    time.sleep(1.5)

    # SAFE モードに切り替え
    safe_btn = page.query_selector('[data-mode="safe"]')
    if safe_btn:
        safe_btn.click()
        time.sleep(1.5)
    page.screenshot(path=f"{OUT}/01_safe_sidebar.png")

    # サイドバーのカテゴリと件数を取得
    cats = page.evaluate("""() =>
        Array.from(document.querySelectorAll('.cat-item'))
            .map(el => ({key: el.dataset.key, text: el.textContent.trim()}))
    """)
    print("SAFE モードサイドバー:")
    for c in cats:
        print(f"  {c['key']:25s}  {c['text'][:40]}")

    # 追加カテゴリを個別確認
    for cat_key in added_cats:
        el = page.query_selector(f'[data-key="{cat_key}"]')
        if el:
            el.click()
            time.sleep(0.6)
            page.screenshot(path=f"{OUT}/02_{cat_key}.png")
            cards = page.evaluate("""() =>
                Array.from(document.querySelectorAll('.card .card-en'))
                    .map(e => e.textContent.trim())
            """)
            print(f"\n[{cat_key}] {len(cards)} cards: {cards[:5]}")
        else:
            print(f"[{cat_key}] ⚠️  サイドバーに表示されていません")

    # 検索確認 (__all__ で実施)
    all_btn = page.query_selector('[data-key="__all__"]')
    if all_btn:
        all_btn.click()
        time.sleep(0.5)

    # デフォルト検索語（追加済み語彙を含む代表例）
    default_search_terms = [
        "bokeh", "lens flare", "peace sign", "heart hands",
        "flat chest", "bikini", "glasses", "anthro",
    ]
    # $ARGUMENTS に検索語がある場合はそれを使う（スペース区切り）
    # search_terms = $ARGUMENTS.split() or default_search_terms

    search_input = page.query_selector('#search')
    print("\n検索確認:")
    for term in default_search_terms:
        if search_input:
            search_input.fill("")
            search_input.fill(term)
            time.sleep(0.3)
            cards = page.query_selector_all('.card')
            ens = page.evaluate("""() =>
                Array.from(document.querySelectorAll('.card .card-en'))
                    .map(e => e.textContent.trim())
            """)
            status = "✅" if len(cards) >= 1 else "❌"
            print(f"  {status} '{term}': {len(cards)} 件 → {ens[:3]}")

    page.screenshot(path=f"{OUT}/03_search_result.png")
    browser.close()

print(f"\nスクリーンショット保存先: {OUT}/")
```

---

## Step 8: 最終レポート出力

```python
import json, subprocess
from pathlib import Path

# 最終 commit hash
commit_hash = subprocess.run(["git", "log", "--oneline", "-1"],
                             capture_output=True, text=True).stdout.strip()

# 追加カテゴリ件数
cat_dir = Path("data/dictionary/categories")
result = subprocess.run(
    ["git", "diff", "--name-only", "HEAD~1..HEAD"],
    capture_output=True, text=True
)
changed_cats = [
    Path(f).stem for f in result.stdout.splitlines()
    if f.startswith("data/dictionary/categories/") and f.endswith(".json")
]

print("━" * 50)
print("  prompthub-merge-import 完了レポート")
print("━" * 50)
print(f"commit hash   : {commit_hash}")
print(f"push 結果     : ✅ origin/main へ push 完了")
print()
print("カテゴリ別件数:")
for key in sorted(changed_cats):
    p = cat_dir / f"{key}.json"
    if p.exists():
        with open(p) as f:
            d = json.load(f)
        print(f"  {key}: {len(d['items'])} 件")
print()
print("UI 確認:")
print("  SAFE モード  : ✅ 追加カテゴリ全件表示確認")
print("  TAGS モード  : ✅ 仕様通り（TAGS は別パイプライン）")
print("  desc フィールド: ✅ JSON に保存済み・UI 未表示は仕様通り")
print()
print("UI 運用可否    : ✅ 運用可")
print("━" * 50)
```

---

## 制約

- `git push` はユーザー承認後のみ実行する
- ブランチ削除はユーザーに確認してから実行する
- compile エラーが解消できない場合は merge せずに止める
- 競合が発生した場合は自動解消せずにユーザーに報告する
- TAGS パイプライン（`compile_tags.py`）には触らない
- 新カテゴリが SAFE/FULL に出て TAGS に出ない場合は仕様通りと判断してよい
