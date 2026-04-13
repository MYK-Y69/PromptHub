# PromptHub v2 要件定義書

最終更新: 2026-04-13
目的: この文書は Claude Code が PromptHub v2 を迷わず構築するための要件定義書である。

---

## 1. プロダクト概要

AIイラスト（Stable Diffusion / NovelAI）用の単語タグプロンプト管理Webアプリ。
タグの閲覧・検索・コピー・Prompt Builder での組み立てをブラウザ上で行う。

### 1-1. 基本方針
- 旧 PromptHub 本体とのマージは不要
- 旧資産（タグデータ）は新本線へ移行する
- SAFE / FULL モードは削除（TAGSへ未移行データがあれば先に移行）
- TAGS が唯一の主軸モード
- 構築後に日常運用できる状態にすることがゴール

---

## 2. モード構成

### 2-1. TAGS（主軸）
- レコード形式で `英語タグ | 日本語説明 | コピー` を一覧表示
- カテゴリ → セクション → タグ の3階層
- 一覧性・検索性最優先
- カードUIは使わない

### 2-2. Prompt Builder
- 選択したタグを組み合わせてプロンプト文を構築・コピーする機能
- TAGSと並行して使う
- SAFE/FULL の代替ではなく、タグ選択の出力先

### 2-3. センシティブ
- 左サイドバーの固定カテゴリ名（名称変更不可）
- ユーザーが指定するのはサブカテゴリ（section）のみ
- カテゴリ名を勝手に増やさない
- 今後のセンシティブ系追加はこの枠内で行う

### 2-4. SAFE / FULL（削除対象）
- TAGSに未収録のデータがあれば先にTAGSへ移行
- 移行完了後に削除
- 再確認不要

---

## 3. データ構造

### 3-1. 形式
- JSON

### 3-2. 階層構造
```
カテゴリ（表情、ポーズ、服装 等）
  └ セクション（笑顔の種類、邪悪さ 等）
      └ タグ（en / jp ペア + 属性）
```

### 3-3. タグオブジェクトの構造
```json
{
  "en": "hand on hip",
  "jp": "腰に手を当てる",
  "target": "self",
  "target_note": null
}
```

### 3-4. target 属性（動作対象）
ポーズ・動作・行動系カテゴリのタグに付与する。
表情・髪型など動作対象の概念がないカテゴリには不要。

| 値 | 意味 | 例 |
|---|---|---|
| `self` | 自分の体に対する動作 | hand on hip, arms behind head, self hug |
| `other` | 他人に対する一方向の動作 | hand on another's shoulder, patting head |
| `mutual` | 複数人の相互動作 | arm link, holding hands, symmetrical docking |
| `object` | 物に対する動作 | holding phone, holding weapon |

- 曖昧なタグは最も一般的な用途を優先して1つ割り当て
- 必要に応じて `target_note` に補足を記載
- 例: `hug` → target: "other", target_note: "self_hugの場合はself"

### 3-5. メタデータ
各カテゴリまたはタグに以下を保持可能とする。
- `source_url`: 取り込み元URL
- `source_site`: ソースサイト名（sorenuts 等）
- `imported_at`: 取り込み日時

### 3-6. JSON全体構造イメージ
```json
{
  "categories": [
    {
      "id": "expression",
      "label": "表情",
      "source_url": "https://sorenuts.jp/1954/",
      "source_site": "sorenuts",
      "imported_at": "2026-04-13T00:00:00Z",
      "sections": [
        {
          "id": "smile_types",
          "label": "笑顔の種類",
          "tags": [
            {
              "en": "smile",
              "jp": "笑顔、スマイル",
              "target": null,
              "target_note": null
            },
            {
              "en": "grin",
              "jp": "にやり・歯を見せる幅広い笑顔",
              "target": null,
              "target_note": null
            }
          ]
        },
        {
          "id": "evil",
          "label": "邪悪さ",
          "tags": [
            {
              "en": "evil smile",
              "jp": "邪悪な笑み",
              "target": null,
              "target_note": null
            }
          ]
        }
      ]
    },
    {
      "id": "pose",
      "label": "ポーズ",
      "source_url": "https://sorenuts.jp/4566/",
      "source_site": "sorenuts",
      "imported_at": "2026-04-13T00:00:00Z",
      "sections": [
        {
          "id": "hand_pose",
          "label": "手のポーズ",
          "tags": [
            {
              "en": "hand on hip",
              "jp": "腰に手を当てる",
              "target": "self",
              "target_note": null
            },
            {
              "en": "holding hands",
              "jp": "手をつなぐ",
              "target": "mutual",
              "target_note": null
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 4. プロンプト取り込み（自動化）

### 4-1. 実行環境
- Claude Code（ローカルPC上）で実行
- ブラウザからの取り込みは行わない（CORS制約回避不要）

### 4-2. 取り込みフロー
```
URL指定 → HTML取得 → パース → target自動判定 → 重複チェック → JSON追加 → コンパイル → UI反映
```

### 4-3. sorenuts.jp パーサー（初期対応）
sorenuts.jp のページ構造:
- HTMLテーブル形式で「日本語説明 | 英語タグ」がペアで格納
- テーブル内の太字行がセクション見出し
- ページタイトルがカテゴリ名に対応

対象ページ一覧（初期取り込み対象）:
| カテゴリ | URL |
|---|---|
| 表情・目の形 | https://sorenuts.jp/1954/ |
| ポーズ・体の特徴 | https://sorenuts.jp/4566/ |
| 服装 | https://sorenuts.jp/4580/ |
| 環境・背景・場所 | https://sorenuts.jp/2420/ |
| カメラ・構図 | https://sorenuts.jp/2908/ |
| 髪型 | https://sorenuts.jp/6667/ |
| 動作・行動 | https://sorenuts.jp/4507/ |
| 職業・種族 | https://sorenuts.jp/2187/ |
| 画風 | https://sorenuts.jp/3602/ |

### 4-4. パーサーのプラグイン構造
```
parsers/
  sorenuts.py     # sorenuts.jp 専用パーサー
  danbooru.py     # 将来追加
  civitai.py      # 将来追加
  base.py         # 共通インターフェース（parse → 統一JSON形式）
```
- 各パーサーは統一された出力形式（3-6のJSON構造）を返す
- 新サイト対応時はパーサーファイルを1つ追加するだけ

### 4-5. target 自動判定
取り込み時に以下のロジックで自動分類:
- 英語タグに `self`, `own`, `behind head/back` 等 → self
- `another's`, `partner`, `someone` 等 → other
- `holding hands`, `arm link`, `symmetrical` 等 → mutual
- `holding [物]`, `carrying`, `wearing [装備]` 等 → object
- 判定不能 → null（後から手動で付与可能）
- ポーズ・動作・行動系カテゴリのみ判定対象

### 4-6. 重複チェック
- `en`（英語タグ）をキーとして重複判定
- 既存TAGSデータに同一 `en` があればスキップ
- 日本語説明だけ異なる場合は警告を出す（上書きはしない）

---

## 5. UI設計方針

### 5-1. 基本方針
- カードではなくレコード形式（横並び一行）
- 一覧性・検索性最優先
- 日本語UIラベル
- 無駄な装飾より運用のしやすさ

### 5-2. TAGS表示
- `en | jp | コピーボタン` の横並びレコード
- 1カラム、gap: 0 で詰める
- 情報量は多くてよいが、見え方は整理されていること
- target 属性がある場合はアイコンまたはラベルで視覚的に区別

### 5-3. セクション見出し
- 日本語表示
- 内部キー（id）と表示ラベル（label）を分離
- 視認性が高い区切り

### 5-4. ジャンプバー
- 上部にサブカテゴリジャンプUI
- チップ群はラップ構造
- セクション間の快適な移動を支援

### 5-5. Sticky挙動
- 安易にstickyを入れない
- 「便利そうに見えて邪魔なsticky」は不要

### 5-6. 検索・フィルタ
- 全タグ横断検索（en / jp 両方）
- カテゴリ絞り込み
- target によるフィルタ（self / other / mutual / object）

---

## 6. ホスティング・リポジトリ

### 6-1. リポジトリ
- 既存の PromptHub リポジトリを引き続き使用
- GitHub: myk-y69/PromptHub

### 6-2. ホスティング
- GitHub Pages（静的サイト）

### 6-3. 移行戦略（ダウンタイム回避）
- 現行の `main` ブランチはそのまま維持（現行アプリが動き続ける）
- `v2` ブランチで新本線を構築
- SAFE/FULL → TAGS へのデータ移行を `v2` ブランチ内で実施
- 完成・動作確認後に `v2` → `main` へマージ
- GitHub Pages の公開パスを新本線に切り替え

---

## 7. Claude Code コマンド体系

### 7-1. コマンド一覧
| コマンド | 役割 |
|---|---|
| `/prompthub-import` | URL指定→スクレイピング→パース→重複チェック→JSON追加→コンパイル |
| `/prompthub-build` | JSON→UIコンパイル・ローカル確認 |
| `/prompthub-deploy` | commit→push→Pages反映確認 |
| `/prompthub-diagnose` | 現在構造の診断・棚卸し |

### 7-2. コマンド設計原則
- 目的が明確
- なるべく一回で完結
- 入力元が固定されている
- 検証まで含む
- エラー時に何が足りないかがわかる

### 7-3. 確認レベル
- 低リスク操作（読み取り、ローカル確認、commit等）: 確認省略
- 高リスク操作（削除、大規模置換、push、main反映）: 確認あり

---

## 8. 実装計画

### Phase 1: データ移行・構造構築
1. 既存リポジトリの棚卸し
2. SAFE/FULL → TAGS への未移行データ洗い出し・移行
3. 新JSON構造の定義・初期データ生成
4. SAFE/FULL の削除

### Phase 2: スクレイピング基盤
1. パーサー共通インターフェース構築
2. sorenuts.jp パーサー実装
3. target 自動判定ロジック実装
4. 重複チェック実装
5. sorenuts.jp 全ページ一括取り込み実行

### Phase 3: WebアプリUI
1. TAGS レコード形式UI構築
2. カテゴリ・セクション・ジャンプバー
3. 検索・フィルタ（target含む）
4. Prompt Builder
5. センシティブカテゴリ
6. レスポンシブ対応

### Phase 4: コマンド・運用整備
1. `/prompthub-import` コマンド
2. `/prompthub-build` コマンド
3. `/prompthub-deploy` コマンド
4. `/prompthub-diagnose` コマンド

### Phase 5: 切り替え・本番化
1. v2 ブランチの最終動作確認
2. main へのマージ
3. GitHub Pages 切り替え
4. 旧コード・旧データの整理

---

## 9. 決定済み事項（再議論不要）

- SAFE/FULL は削除する
- TAGS が唯一の主軸
- 旧本体とのマージは不要
- 旧資産は新へ移行
- センシティブは左サイド固定カテゴリ名
- カードよりレコード形式
- コマンドは一本化
- スクレイピングはClaude Code側で実行
- データ形式はJSON
- target属性は self / other / mutual / object の4種

---
以上
