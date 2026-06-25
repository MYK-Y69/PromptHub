# Implementation Plan

## Intake Summary

PromptHub public appのUI改善を実施する。最重要課題は、現状のGuide Blocksが「大量の辞書セクション一覧」に見えており、ユーザーにとって何のために使うのかが弱いこと。Guide Blocksを「よく使うプロンプト構成を、Builderへ素早く再投入するための再利用パネル」として再設計する。

あわせて、UI満足度監査で優先度が高かった以下も同じ作業導線として修正する。

- Guide Blocksの目的説明
- Pinned / Recently used / My Blocks
- Guide Blockの使用履歴
- Recipe保存時の命名
- CollectionsのQuick Load / Quick Copy

## Assumptions

- 既存のReact/Vite構成とlocalStorage保存を維持する。
- 実装範囲は `public-app/src/App.jsx`、`public-app/src/styles.css`、`public-app/scripts/check-app.mjs`、ハーネス成果物に限定する。
- 大規模なコンポーネント分割やデータ移行は行わない。
- Guide Blocksは辞書由来ブロック、コアブロック、ユーザー作成ブロックを引き続き併用する。
- Pinnedはユーザー操作、Recently usedはGuide Block使用時に自動更新、My Blocksはユーザー作成ブロックから表示する。

## Screen Structure

### Builder

- Guide Blocks見出しを「よく使う構成をまとめて追加」に寄せ、用途を明確にする。
- Guide Blocks上部にショートカット領域を追加する。
  - Pinned: 固定したブロック
  - Recently used: 最近使ったブロック
  - My Blocks: ユーザー作成ブロック
- 既存の検索・カテゴリ・一覧は「Library」として残し、600件超の辞書を探索できる場所にする。
- 各Guide Blockカードには以下を出す。
  - 主操作: `+Positive`
  - 補助操作: `+Negative`
  - 固定: Pin / Unpin
  - コピー: Copy
  - メタ情報: category/source path、tag count、使用回数
- 出力と保存パネルにRecipe名入力欄を追加し、保存時にその名前を使う。

### Collections

- Recipe一覧の操作にQuick reuseを追加する。
  - Load
  - Copy Positive
  - Copy Both
  - Rename
  - Duplicate
  - Export
  - Delete
- Guide Blocksセクションは「自分で作った再利用ブロック」として説明を強化する。
- 行動の優先順位はQuick Load / Quick Copyを先に置き、破壊的操作は最後に置く。

## Component Structure

単一ファイル構成は維持しつつ、以下の小さなヘルパー/表示関数を追加する。

- `getBlockTags(block, side)`
- `getBlockSummary(block)`
- `getGuideBlockMeta(block, guideBlockUsage)`
- `GuideBlockShortcutSection`
- `GuideBlockCard`

既存 `BuilderView` のGuide Blocks部分を、ショートカット領域とLibrary領域に分ける。

## State Management

新しいlocalStorage保存対象を追加する。

- `prompthub:v1:pinnedGuideBlocks`
- `prompthub:v1:recentGuideBlocks`
- `prompthub:v1:guideBlockUsage`
- `prompthub:v1:draftRecipeName`

React state:

- `pinnedGuideBlockIds`
- `recentGuideBlockIds`
- `guideBlockUsage`
- `draftRecipeName`

Guide Block使用時:

- 使用ブロックをRecent先頭へ移動
- 最大件数を制限する
- 使用回数と最終使用時刻を更新する
- 既存のDraft追加処理を維持する

Pinned:

- toggle操作でlocalStorageへ保存する
- Pinnedセクションは最大6件表示

My Blocks:

- `userGuideBlocks` のうち `userCreated` を最大6件表示

Recipe保存:

- `draftRecipeName.trim()` があれば保存名に使う
- 空なら既存の自動名を使う
- 保存後は入力欄をクリアする

## Data Model / Data Flow

- 既存のimport/export JSONに新しいGuide Block関連状態を含める。
- import時は配列/オブジェクトを正規化し、不正値でUIが壊れないようにする。
- reset時はPinned/Recent/Usage/Recipe名も初期化する。
- check scriptで新しい保存キーとUI markerを確認する。

## Technical Approach

- 既存の`readNormalizedJson`、`writeJson`、`normalizeImportedStrings`を再利用する。
- `guideBlocks` 配列は現状どおり合成し、IDを基準にPinned/Recentを解決する。
- Recentから消えたIDは表示時に自然に無視する。
- UI追加はCSSグリッドと既存カードスタイルを拡張し、依存関係は追加しない。

## UI / UX Approach

- Guide Blocksの価値を「探す」ではなく「再利用する」に置き換える。
- 上段にすぐ使うショートカット、下段に検索Libraryという構造にする。
- 初見でも「ブロック単位で追加すると作業が速くなる」と分かるコピーを入れる。
- 日常利用ではPinned/Recent/My Blocksから1クリックで追加できるようにする。
- Collectionsでは保存済みレシピを管理するだけでなく、素早く読み込み/コピーできるようにする。

## Accessibility Approach

- Pin、Copy、+Positive、+Negativeに明確な `aria-label` を付ける。
- ボタン内テキストは短くしつつ、スクリーンリーダー向けラベルで補う。
- Recipe名入力にlabelを付ける。
- カード操作はbutton要素を使い、フォーカススタイルは既存のfocus-visibleを活かす。

## Responsive Approach

- デスクトップはショートカット領域を2-3列のカードグリッドにする。
- モバイルは1列に積む。
- CollectionsのQuick操作は折り返し可能にし、既存のモバイルカード化テーブルを維持する。
- 横スクロールやテキストはみ出しを避ける。

## Verification Plan

- `npm run build`
- `npm run check`
- `git diff --check`
- ブラウザ確認:
  - BuilderでGuide Blocksの目的説明が見える
  - Pin / Unpinが動き、Pinnedに反映される
  - Guide Block使用後にRecently usedへ反映される
  - My Blocks作成後にショートカットへ表示される
  - +Positive / +Negative / Copyが動く
  - Recipe名を入力して保存するとCollectionsに反映される
  - CollectionsでCopy Both / Copy Positive / Loadが使える
  - モバイル幅でBuilder/Collectionsが横にはみ出さない

## Work Sequence

1. localStorage key、state、normalizerを追加する。
2. Guide Block使用履歴・pin toggle・copy helperを追加する。
3. BuilderのGuide Blocks UIをショートカット + Libraryへ再構成する。
4. Builder保存パネルにRecipe名入力欄を追加する。
5. CollectionsのRecipe行にQuick Copy導線を追加する。
6. CSSを追加し、desktop/mobile両方を整える。
7. check scriptを更新する。
8. build/check/browser QAを実行する。
9. implementation reviewを実施し、85点未満ならrepair loopを回す。

## Risks and Mitigations

- `App.jsx`がさらに大きくなる。
  - 小さなヘルパーと表示コンポーネントに分け、局所的に抑える。
- Guide Blocks上段が増え、Builderが長くなる。
  - Pinned/Recent/My Blocksは最大表示数を制限する。
- 操作が増えてカードがうるさくなる。
  - `+Positive` を主操作、その他は小さなrow actionsにする。
- 古いlocalStorageデータが混在する。
  - normalizerとfallbackで安全に読む。

## Out of Scope

- アカウント、クラウド同期、共有機能。
- 大規模なコンポーネント分割。
- 辞書パイプラインやデータ本体の編集。
- 日本語同義語検索の本格実装。
- git push。
