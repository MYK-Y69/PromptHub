`data/v2/tags.json` を再コンパイルし、ローカルサーバーを起動して UI を確認する。

以下の手順を **そのまま** 実行してください。

---

## Step 1: コンパイル実行

```bash
python3 tools/compile_v2.py
```

エラーが出た場合は原因を特定して最小修正で解消する。解消できない場合はユーザーに報告して終了する。

---

## Step 2: コンパイル結果確認

```python
import json
from pathlib import Path

with open("data/v2/compiled/tags.json") as f:
    d = json.load(f)

print(f"compiled/tags.json: {d['count']} tags  ({d['generated_at']})")
print()
for cat in d["categories"]:
    n_tags = sum(len(s["tags"]) for s in cat["sections"])
    print(f"  {cat['id']:15s} {n_tags:5d} tags  {len(cat['sections']):2d} sections")
```

---

## Step 3: ローカルサーバー起動

```bash
kill $(lsof -ti:8765) 2>/dev/null; true
python3 -m http.server 8765 --directory . &>/tmp/prompthub_server.log &
sleep 1
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:8765/app/index.html
```

HTTP 200 が返ることを確認する。返らない場合は `/tmp/prompthub_server.log` を確認してエラーを報告する。

---

## Step 4: Playwright による UI 確認

```python
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("⚠️  playwright 未インストール。ブラウザで http://localhost:8765/app/index.html を確認してください。")

if HAS_PLAYWRIGHT:
    import time, json
    from pathlib import Path
    from playwright.sync_api import sync_playwright

    BASE = "http://localhost:8765/app/index.html"
    OUT  = "/tmp/prompthub_build"
    Path(OUT).mkdir(exist_ok=True)

    with open("data/v2/compiled/tags.json") as f:
        compiled = json.load(f)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(BASE, wait_until="networkidle")
        time.sleep(1.5)
        page.screenshot(path=f"{OUT}/01_initial.png")

        # サイドバーカテゴリ数確認
        cat_items = page.query_selector_all(".cat-item")
        print(f"サイドバー: {len(cat_items)} カテゴリ  (期待値: {len(compiled['categories'])})")

        # 最初のカテゴリのレコード数確認
        records = page.query_selector_all(".record")
        print(f"初期表示レコード数: {len(records)}")

        # 各カテゴリをクリックして確認
        errors = []
        for btn in cat_items:
            label = btn.inner_text().strip()
            btn.click()
            time.sleep(0.5)
            recs = page.query_selector_all(".record")
            js_errors = page.evaluate("() => window.__errors__ || []")
            status = "✅" if len(recs) > 0 else "❌"
            print(f"  {status} {label}: {len(recs)} records")
            if len(recs) == 0:
                errors.append(label)

        page.screenshot(path=f"{OUT}/02_final.png")
        browser.close()

    if errors:
        print(f"\n⚠️  レコード0件のカテゴリ: {errors}")
    else:
        print("\n✅ 全カテゴリでレコード表示を確認")

    print(f"\nスクリーンショット: {OUT}/")
```

---

## Step 5: 結果レポート

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  prompthub-build 完了
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
compiled/tags.json: N tags
ローカルサーバー  : http://localhost:8765/app/index.html
UI 確認           : ✅ / ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
次のステップ: /prompthub-deploy で commit & push
```

---

## 制約

- `git commit` / `git push` は **しない**（`/prompthub-deploy` で行う）
- `data/v2/` 以外のファイルは変更しない
