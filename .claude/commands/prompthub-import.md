URL からタグをスクレイピングして `data/v2/tags.json` に追加し、`data/v2/compiled/tags.json` を再コンパイルする。

**引数 `$ARGUMENTS`:**
- URL を1つ以上スペース区切りで指定: `https://memone-ro.com/archives/5`
- `--all-sorenuts` を指定すると全 sorenuts.jp 対象ページを一括処理
- `--all-memone` を指定すると全 memone-ro.com 対象ページを一括処理（104ページ）
- `--dry-run` を追加すると JSON を変更せず統計のみ表示
- `--from-html <file>` でローカル HTML を使用（URL は必須引数として併記）

以下の手順を **そのまま** 実行してください。

---

## Step 1: 引数確認

`$ARGUMENTS` が空の場合は使い方を表示して終了する:

```
使い方:
  /prompthub-import <URL>
  /prompthub-import https://memone-ro.com/archives/5
  /prompthub-import https://sorenuts.jp/1954/ https://sorenuts.jp/4566/
  /prompthub-import --all-memone
  /prompthub-import --all-sorenuts
  /prompthub-import --dry-run https://memone-ro.com/archives/77
  /prompthub-import --from-html /tmp/page.html https://sorenuts.jp/1954/
```

---

## Step 2: 現在の v2 データ確認

```python
import json
from pathlib import Path

src = Path("data/v2/tags.json")
with open(src) as f:
    d = json.load(f)

print(f"v2/tags.json: {d['count']} tags / {len(d['categories'])} categories")
for cat in d["categories"]:
    n_tags = sum(len(s["tags"]) for s in cat["sections"])
    print(f"  {cat['id']:15s} {n_tags:4d} tags")
```

---

## Step 3: インポート実行

```bash
python3 tools/import_v2.py $ARGUMENTS
```

- HTTP エラー（サイトダウン等）: エラーを表示し、`--from-html` の使い方を案内して終了する
- パースエラー: エラー詳細を表示して終了する（JSON は変更しない）
- `--dry-run` 時: 統計を表示して終了する（JSON は変更しない）

---

## Step 4: インポート後の確認

```python
import json
from pathlib import Path

with open("data/v2/tags.json") as f:
    d_src = json.load(f)
with open("data/v2/compiled/tags.json") as f:
    d_comp = json.load(f)

print()
print("━" * 50)
print("  インポート完了")
print("━" * 50)
print(f"v2/tags.json:          {d_src['count']:5d} tags")
print(f"v2/compiled/tags.json: {d_comp['count']:5d} tags  ({d_comp['generated_at']})")
print()
print("カテゴリ別:")
for cat in d_src["categories"]:
    n_tags = sum(len(s["tags"]) for s in cat["sections"])
    print(f"  {cat['id']:15s} {n_tags:5d} tags  {len(cat['sections']):2d} sections")
print("━" * 50)
print("次のステップ: /prompthub-build でローカル確認 → /prompthub-deploy で push")
```

---

## 制約

- `git commit` / `git push` は **しない**（`/prompthub-deploy` で行う）
- `data/v2/` 以外のファイルは変更しない
