# PromptHub UI Satisfaction Audit

Date: 2026-06-26

## Scope

PromptHub public appの現状UIを、ユーザーが「探す、組む、保存する、再利用する」道具として満足して使えるかを評価した。

Evidence folder:

- `reviews/ui-satisfaction-audit-2026-06-26/screenshots/`

Captured screens:

1. `01-explore-desktop.png`
2. `02-builder-guide-blocks-desktop.png`
3. `03-collections-desktop.png`
4. `04-settings-desktop.png`
5. `05-builder-mobile.png`
6. `06-collections-mobile.png`
7. `07-builder-mobile-guideblocks.png`

## Subagent Scores

| Reviewer Focus | Score | Summary |
| --- | ---: | --- |
| Overall UX satisfaction | 82 / 100 | Explore -> Builder -> Collections の基本ループはかなり実用域。大量操作とモバイルが摩擦。 |
| Accessibility / mobile / visual clarity | 76 / 100 | デスクトップは良好。モバイルのタップ領域、ナビ、Guide Blocksの文脈切れが弱い。 |
| Repeat-use workflow | 76 / 100 | 再利用ループは伝わるが、Guide Blocksがまだ説明寄りで、実用ショートカットとして弱い。 |

Integrated satisfaction score: 78 / 100

## Step Health

| Step | Screen | Health | Notes |
| ---: | --- | --- | --- |
| 1 | Explore desktop | Good | 検索、カテゴリ、詳細、Draftが同時に見え、タグ探索から追加までが速い。行アクションは密集気味。 |
| 2 | Builder desktop | Good | Positive/Negative編集は分かりやすい。Guide Blocksは目的説明が出たが、空カードが多い状態では価値が少し弱い。 |
| 3 | Collections desktop | Good | 保存済みレシピのLoad/Copyが明快。再利用場所として成立している。 |
| 4 | Settings desktop | Strong | 設定のまとまり、余白、階層が安定。Reset local dataだけは日常操作からもう少し離したい。 |
| 5 | Builder mobile top | Medium | Prompt編集は破綻なし。チップ内の上下移動/削除が小さく、完成後アクションが下スクロール依存。 |
| 6 | Collections mobile | Medium | 選択中レシピは使いやすいが、一覧管理をしたい時は下に押し下げられる。 |
| 7 | Builder mobile Guide Blocks | Needs improvement | 空のPinned/Recently/My Blocksが縦に長く、実ブロックに到達する前に価値が薄まる。上端に半端なCTAが見える。 |

## Strengths

- Exploreはタグ探索、詳細確認、Positive/Negative追加の距離が短い。
- BuilderはPositive/Negativeの色分けとタグチップ編集が分かりやすい。
- Collectionsは保存済みレシピを読み込み/コピーする場所として明快。
- Settingsは画面密度、言語、詳細ペインなど、日常利用向けの調整が揃っている。
- モバイルでも主要画面は横はみ出しせず、基本操作は読める。

## Main Risks

1. Guide Blocksがまだ「説明された機能」に見える
   - 空のPinned / Recently used / My Blocksが上に並び、実際に使えるブロックが下に追いやられている。
   - 初回ユーザーに「これを押すと作業が速くなる」という体験が弱い。

2. モバイルBuilderの完成後アクションが遠い
   - Copy / Save系の操作が下スクロール依存で、Prompt編集後の次アクションに迷いやすい。

3. 小ボタンが多く、長時間作業で疲れる
   - ExploreのCopy / +Positive / +Negative / Favorite / Hide、CollectionsのLoad / Copy / Rename / Duplicate / Export / Deleteが密集している。

4. モバイルのタップ領域が小さい
   - タグチップ内の `↑` / `↓` / `x` やGuide Blockカードの小ボタンは誤タップリスクがある。

5. モバイルナビに欠落感がある
   - Settingsが見切れ、横スクロール前提に見える。全機能に到達できる安心感が下がる。

## Prioritized Improvements

### P0: Guide Blocksを「すぐ使える部品」に見せる

- 空カードより上に、おすすめ実ブロックを出す。
- 例: `基本Negative`、`自然光ポートレート基本形`、`上半身構図セット`。
- Draft内容に応じたおすすめGuide Blocksを出す。
- `選択中をブロック化` を `今のPositive/NegativeをGuide Blockとして保存` のように具体化する。
- My Blocks保存後は、その場で追加されたブロックを強調表示する。

### P0: モバイルBuilderに固定アクションバーを追加

- `Copy Positive`
- `Copy Negative`
- `Copy Both`
- `Save Recipe`

編集後の出口を常に触れる場所に置く。

### P1: ExploreとCollectionsの小ボタン密度を下げる

- Explore行の主操作は `+Positive` / `+Negative` に寄せる。
- `Copy` / `Favorite` / `Hide` は詳細ペイン側、またはMoreメニューへ移す。
- Collectionsは `Load` と `Copy` を主操作にし、Rename以降は管理メニューへ寄せる。

### P1: モバイルGuide Blocksのレイアウトを圧縮

- Pinned / Recently / My Blocksが空の時は1行サマリーにする。
- モバイルではLibraryまたはおすすめブロックを早めに見せる。
- セクション上端にCTAが半端に残らないよう、余白とスクロール位置を調整する。

### P1: モバイルナビを整理

- タブを2段に折り返す、Moreメニューを置く、またはアイコン+短ラベルにする。
- Settingsが見えない状態を避ける。

### P2: Settingsの危険操作を分離

- `Reset local data` を別セクション化する。
- 日常のExport/Importから視覚的に距離を取る。
- 確認文と余白を強める。

## What Can Wait

- Guide Blocksの高度な並び替え、利用回数ソート、カテゴリ高度フィルタ。
- Export/Importの細かい強化。
- Settingsの文言や見た目の微調整。
- 全体の細かな色/余白調整。

## Evidence Limits

- スクリーンショット中心の監査であり、完全なWCAG適合確認ではない。
- キーボード操作、フォーカス順、スクリーンリーダー読み上げ、実測コントラストは未検証。
- コピー成功、保存エラー、localStorage例外などの動作検証は今回の満足度監査の主対象外。

## Conclusion

PromptHubは、タグを探して、Prompt Draftを組み、レシピとして再利用するプロダクトとしてはすでに伝わる。現時点の満足度は78/100。

次の大きな伸びしろはGuide Blocks。ここを「説明カード」ではなく「今すぐ使える部品」「自分の型が増えていく場所」に変えると、単発利用から習慣利用に近づく。
