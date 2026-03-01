# PromptHub

TSV から JSON 辞書を生成し、ローカル UI で閲覧・コピーするツール。

## 使い方（3ステップ）

```bash
# 1. TSV を JSON 辞書に変換
python tools/import_tsv.py imports/inbox/expression_sample.tsv

# 2. ローカル HTTP サーバを起動
python -m http.server 8000

# 3. ブラウザで開く
http://localhost:8000/app/
```

## UI の機能

- **カテゴリ一覧**（左サイドバー）: カテゴリ名と件数を表示
- **検索**: jp / en / tags への部分一致（大文字小文字無視）
- **タグチップ**: タグをクリックで絞り込み、再クリックで解除
- **カード**: en / jp / tags を表示。📋 ボタンで en をクリップボードへコピー
- **複数選択コピー**: カードをクリックして選択 → 「選択をまとめてコピー」ボタンでまとめてコピー

## TSV 仕様

| 列 | 必須 | 説明 |
|---|---|---|
| `category` | ✅ | カテゴリキー（例: `expression`）|
| `jp` | ✅ | 日本語 |
| `en` | ✅ | 英語（空行はスキップ）|
| `tags` | - | カンマ区切り（例: `cute,sad`）|
| `source` | - | 参照URL など |

- エンコード: **UTF-8**
- 区切り: **タブ**
- 1行目はヘッダー行

## ディレクトリ構成

```
PromptHub/
├─ app/
│  ├─ index.html
│  ├─ app.css
│  └─ app.js
├─ data/
│  └─ dictionary/
│     └─ expression.json   ← import_tsv.py が生成
├─ imports/
│  └─ inbox/
│     └─ expression_sample.tsv
├─ tools/
│  └─ import_tsv.py
└─ README.md
```

## インポートスクリプトの仕様

- `category` が `expression` 以外の行も自動でファイル分け可能（`data/dictionary/<category>.json` に出力）
- 既存 JSON に `en` 完全一致がある場合は既存優先（重複追加しない）
- `items` は `en` の昇順でソートして保存
