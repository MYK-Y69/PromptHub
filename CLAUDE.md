# PromptHub — Claude Code 運用ガイド

## リポジトリ概要

画像生成プロンプト語彙ハブ。
`data/dictionary/categories/*.json` に語彙を格納し、`tools/compile_dictionary.py` でコンパイルして UI（`app/app.js`）に表示する。

### 主要パス

| パス | 役割 |
|------|------|
| `data/dictionary/categories/*.json` | 語彙ソース（カテゴリ別） |
| `data/dictionary/compiled/safe.json` | コンパイル済み（SAFE版） |
| `data/dictionary/compiled/full.json` | コンパイル済み（FULL版） |
| `data/dictionary/compiled/tags.json` | TAGS モード用（別パイプライン） |
| `tools/compile_dictionary.py` | SAFE/FULL コンパイラ |
| `tools/compile_tags.py` | TAGS コンパイラ（別系統） |
| `data2/` | 外部原本ファイル置き場（NotebookLM 等） |
| `app/app.js` | フロントエンド（SECTION_TO_MAJOR 等を定義） |

### アーキテクチャ上の注意

- **SAFE/FULL** と **TAGS** は別パイプライン。`data2` 取り込みは SAFE/FULL 側のみ。
- 新カテゴリを追加したら `app.js` の `SECTION_TO_MAJOR` と `SECTION_LABEL_JP` も更新する。
- `compile_dictionary.py` は同一 ID の重複があると fail-fast で終了する。

### 静的アセットのキャッシュ対策

- `app/index.html` と `app/app.js` の静的アセット参照（`app.js`, `app.css`, `safe.json`, `full.json`, `tags.json`）は `?v=<shortsha>` 形式で参照する。
- `?v=` の値は **push のたびに GitHub Actions (`bump-version.yml`) が自動更新**する。手動で変える必要はない。
- **push 後の確認は通常リロードでよい**（ハードリロード不要）。Actions が完了（約1分）したあとにリロードすれば最新が表示される。
- `tools/bump_version.py` を直接実行して手動バンプすることも可能（引数: 任意の版文字列）。

---

## 確認削減ルール

### 確認なしで進めてよい操作

- 読み取り専用コマンド（`git status` / `git log` / `git diff` / `git fetch` / `ls` / `cat` / `find` / `grep`）
- Python によるデータ整形・集計・重複チェック・JSON 生成
- `data/dictionary/categories/` への新規ファイル追加・既存ファイルへのアイテム追記
- `python3 tools/compile_dictionary.py` の実行
- `git add` / `git commit`（add/commit 自体の実行は確認不要）
- `git checkout -b <branch>` によるブランチ作成
- `/tmp/` への一時ファイル出力
- ローカル HTTP サーバーの起動・再起動（ポート 8765）
- Playwright によるスクリーンショット取得・UI 確認
- `app/app.js` の `SECTION_TO_MAJOR` / `SECTION_LABEL_JP` への追記

### 必ず確認してから実行する操作

- `git push`（push 先・内容を明示してから承認を得る）
- `git reset --hard`（破壊的リセット）
- 既存アイテムの削除・置換（`data/dictionary/categories/` 内の既存 JSON のアイテム削除）
- `git branch -D` / `git push --delete`（ブランチ削除）
- `data/inbox/*.tsv` の直接編集（TAGS パイプラインの変更）
- 想定外の大規模アーキ変更

---

## カスタムコマンド一覧

| コマンド | 役割 |
|---------|------|
| `/import_expression` | テキスト貼り付けから expression に追加 |
| `/import_expression_from_url` | URL から expression を抽出して追加 |
| `/paste-expression` | bash スクリプト経由で expression を追加 |
| `/prompthub-run-data2-import` | **★ 推奨** data2 原本から main push まで全工程を1コマンドで完結 |
| `/prompthub-import-data2` | 個別フェーズ: `data2/` 原本から未収録語彙を branch に追加して compile |
| `/prompthub-review-import` | 個別フェーズ: import branch をレビューし最小修正 → 再 compile |
| `/prompthub-merge-import` | 個別フェーズ: review 済み branch を main へ merge → push → UI 確認 |

---

## data2 取り込みフロー（標準）

**通常はこれ1つでよい:**

```
1. data2/ に原本配置
2. /prompthub-run-data2-import
   → 原本解析 → 重複除外 → branch作成 → JSON追加 → compile →
     レビュー → 修正確認 → merge → push → UI確認 → 最終レポート
```

**個別フェーズを手動で走らせたい場合のみ:**

```
/prompthub-import-data2   # フェーズA+B: 解析・追加・compile
/prompthub-review-import  # フェーズC: レビュー・修正
/prompthub-merge-import   # フェーズD+E+F: merge・push・UI確認
```

## category JSON スキーマ

```json
{
  "key": "category_key",
  "label": "Display Label",
  "items": [
    {
      "id":   "prefix_slug",
      "en":   "english term",
      "jp":   "日本語訳",
      "tags": ["category_key"],
      "desc": "説明文（任意）"
    }
  ]
}
```

ID プレフィックス規則:

| カテゴリ | prefix |
|---------|--------|
| camera_comp | cc |
| body_features | bf |
| pose_action | pa |
| clothing | cl |
| accessories | acc |
| e621_pony | e6 |
| expression | expression |
| action | act |
| pose | pose |
| pov | pov |
| focus | foc |
| angle | ang |
