# PromptHub UI Satisfaction Repair Plan

## Intake Summary

User goal: UI満足度レビューの全スコアを85以上に引き上げる。

Current audited scores:

- Overall UX satisfaction: 82 / 100
- Accessibility / mobile / visual clarity: 76 / 100
- Repeat-use workflow: 76 / 100
- Integrated score: 78 / 100

The product already communicates the core loop:

```text
Explore -> Builder -> Collections -> reuse
```

The remaining score blockers are concentrated in:

- Guide Blocksが説明カードに見え、初回から「すぐ使える部品」に見えない。
- モバイルBuilderで完成後のCopy/Saveが遠い。
- Explore/Collectionsの行アクションが密集している。
- モバイルナビでSettingsが見切れ、全機能へ届く安心感が弱い。
- SettingsのReset local dataが日常操作に近い。

## Requirements

- Keep the public app isolated under `public-app/`.
- Do not edit dictionary pipelines or source prompt data.
- Improve the current UI enough that independent subagent satisfaction scores can reasonably reach 85+.
- Keep changes scoped, maintainable, and consistent with the current React/CSS structure.
- Preserve existing core behavior: Explore add/copy/favorite/hide, Builder draft editing, Guide Blocks usage, recipe save/load/copy, local import/export/reset.
- Add no new runtime dependencies.

## Screen Changes

### Builder / Guide Blocks

- Add a prominent `Recommended Blocks` section above empty shortcut buckets.
- Populate recommended blocks from existing Guide Blocks, prioritizing:
  - pinned
  - recently used
  - high-use core blocks
  - useful dictionary blocks matching current Draft tags/searchable text
- Keep Pinned / Recently used / My Blocks, but compress empty states so they do not dominate mobile.
- Rename `選択中をブロック化` to `今のDraftをGuide Block化`.
- After creating a Guide Block, surface it in My Blocks and allow it to appear in recommendations.
- On mobile, show recommended/library content sooner and avoid half-clipped CTA behavior.

### Builder / Mobile Completion Actions

- Add a mobile-only sticky bottom action bar for:
  - `Copy +`
  - `Copy -`
  - `Copy both`
  - `Save`
- Keep desktop inspector unchanged.
- Ensure mobile sticky bar does not cover content by adding bottom padding.

### Explore

- Reduce row action density.
- Keep `+Positive` and `+Negative` as primary row actions.
- Move `Copy`, `Favorite`, and `Hide` into a compact `More` disclosure inside each row.
- Preserve immediate access to those actions without relying only on the right inspector.

### Collections

- Reduce recipe row action density.
- Keep `Load` and `Copy` as primary row actions.
- Move `Copy Positive`, `Rename`, `Duplicate`, `Export`, and `Delete` into a compact `More` disclosure.
- Keep selected recipe inspector actions unchanged.

### Mobile Navigation

- Let top navigation wrap instead of horizontal scrolling.
- Keep all five primary destinations visible at common mobile widths.
- Maintain active state and status pills.

### Settings

- Move `Reset local data` into a visually distinct danger zone row.
- Keep Export/Import as normal local data controls.

## Component / State Approach

- Add small helper components in `App.jsx`:
  - `ActionMenu`
  - `BuilderMobileActionBar`
  - `RecommendedGuideBlocks`
- Use local component state for row-level `More` menus.
- Avoid global state additions unless required.
- Reuse existing `copyText`, `applyGuideBlock`, `saveRecipe`, and `createGuideBlockFromDraft`.
- Add static check markers to `public-app/scripts/check-app.mjs`.

## Accessibility / Responsive Approach

- `More` disclosure buttons use `aria-expanded`.
- Hidden action groups remain keyboard reachable when open.
- Mobile action bar buttons have concise labels and accessible names.
- Guide Block buttons have larger hit targets on mobile.
- Top navigation wraps without clipping.
- Empty shortcut sections use compact states on mobile.

## Verification Plan

- `npm run build`
- `npm run check`
- `git diff --check`
- Browser screenshots:
  - Explore desktop
  - Builder desktop
  - Collections desktop
  - Settings desktop
  - Builder mobile top
  - Builder mobile Guide Blocks
  - Collections mobile
- Subagent rescoring:
  - Overall UX satisfaction
  - Accessibility / mobile / visual clarity
  - Repeat-use workflow
- Completion requires every independent score to be at least 85.

## Work Sequence

1. Update plan and plan review artifacts.
2. Add recommended Guide Blocks and compact shortcut treatment.
3. Add mobile sticky Builder action bar.
4. Convert dense row actions to primary actions + More menus.
5. Wrap mobile top navigation.
6. Separate Settings danger zone.
7. Update static checks.
8. Run build/check/diff verification.
9. Capture screenshots and rerun subagent scoring.
10. If any score remains under 85, run another repair loop.

## Scope Exclusions

- Account/cloud sync.
- Major component extraction.
- New search algorithm or synonym engine.
- New design system.
- Data import pipeline changes.
- Git push.

---

# Explore Split Pane Repair Plan

## Intake Summary

User goal: Explore画面で、左カテゴリとプロンプト一覧を画面分割し、一覧をスクロールしてもカテゴリが見えなくならないようにする。

The current Explore screen uses a three-column desktop grid, but the page itself scrolls as one surface. When users browse long prompt result lists, the left category rail scrolls away from the viewport. This weakens the main Explore workflow because users lose the ability to jump categories while comparing prompt rows.

## Requirements

- Keep this change scoped to the public app Explore layout.
- Preserve existing category/subcategory behavior, search, filters, result table, inspector, and mobile category strips.
- On desktop and tablet-wide layouts, split Explore into stable panes:
  - left category pane remains visible
  - center prompt list scrolls independently
  - right inspector remains visible when present
- On mobile, keep the current single-column flow with mobile category strips.
- Do not add dependencies or redesign unrelated screens.

## Screen / Layout Approach

- Add Explore-specific pane classes in `App.jsx`:
  - `explore-sidebar`
  - `explore-content`
  - `explore-inspector`
- For desktop (`min-width: 981px`), make `.workspace.explore` a fixed-height grid based on the viewport below the topbar.
- Give each Explore pane its own vertical scrolling:
  - left category pane: `overflow-y: auto`
  - center content: `overflow-y: auto`
  - right inspector: `overflow-y: auto`
- Keep horizontal table overflow inside `.table-wrap`, not on the whole page.
- Preserve the existing medium-width auto-inspector behavior by allowing the inspector to move under the content while the category rail remains independently visible.

## Accessibility / UX Notes

- The category rail should keep the active category visible and usable while results move.
- The list pane should not create nested awkward scrolling on mobile.
- The layout should avoid clipped bottom content by using `min-height: 0` on grid children.
- No visible instructional copy is added.

## Verification Plan

- `npm run build`
- `npm run check`
- `git diff --check`
- Browser or headless layout check at desktop width:
  - `.workspace.explore` height is viewport-bounded
  - category pane and content pane have independent overflow
  - scrolling center content does not move the category pane
- Mobile sanity check:
  - sidebar remains hidden
  - mobile category strips remain available
  - no horizontal document overflow

## Scope Exclusions

- Category ordering or taxonomy changes.
- Prompt data changes.
- New sticky headers for every table column.
- Broader component extraction.
- Git push.

---

# Gradient Color Refresh Plan

## Intake Summary

User goal: 現状のCodexっぽい緑系カラーリングをやめ、添付画像のような紫・青・ピンク・淡いラベンダーのグラデーションカラーへ調整する。

The app is an operational prompt browser/builder, so the new color system should feel more custom and polished while preserving scanability, contrast, and repeated-use ergonomics.

## Requirements

- Keep the change focused on visual color styling.
- Remove the green/teal primary impression from the current UI.
- Use the attached references as the palette direction:
  - violet primary
  - blue secondary accent
  - pink accent
  - soft lavender surfaces
- Preserve readable text, selected states, danger states, and table density.
- Do not change prompt data, layout behavior, navigation structure, or workflows.

## Visual Approach

- Replace primary variables with a violet-led palette.
- Add reusable gradient variables:
  - primary gradient for main CTA, active brand accents, and selected table rail
  - soft gradient for body/background and highlighted Guide Blocks areas
- Use gradients on high-signal controls only, not every surface.
- Convert remaining green-positive areas to lavender/blue-positive areas.
- Keep danger red/pink distinct for destructive actions.

## Verification Plan

- `npm run build`
- `npm run check`
- `git diff --check`
- Static scan that old teal/green accent colors no longer remain in `styles.css`.
- Manual browser check at `http://127.0.0.1:5176/` for overall color impression.

## Scope Exclusions

- New illustrations or image assets.
- Layout redesign.
- Theme switcher.
- Brand/logo redesign beyond color treatment.
- Git push.

---

# Gradient Tone-Down Plan

## Intake Summary

User goal: 前回のカラー調整は色を足しすぎたため、添付画像の下帯のようなラベンダーから紫への落ち着いたグラデーションへ寄せ、文字の視認性を改善する。

## Requirements

- Reduce the number of accent hues.
- Keep the palette close to lavender/purple gradient, without strong blue/pink spread.
- Improve text readability by using solid dark text for navigation, labels, and brand text.
- Use gradients only on high-signal actions and subtle highlighted surfaces.
- Preserve existing layout and workflows.

## Approach

- Replace the previous multi-color gradient with a simpler lavender-to-purple gradient.
- Remove body radial color washes and return the app background to a quiet near-white lavender.
- Make the topbar mostly white again.
- Use solid purple for brand accent and selected nav instead of gradient text.
- Keep primary buttons as white text on a clear gradient, matching the reference banner.
- Update checks so stale over-colorized blue/pink palette values cannot remain.

## Verification

- `npm run build`
- `npm run check`
- `git diff --check`
- Local server HEAD check

## Scope Exclusions

- Layout redesign.
- New imagery.
- Theme switching.
- Git push.

---

# Pane Split Follow-up Plan

## Intake Summary

User goals:

- Reverse the current gradient direction so it moves from dark purple to light lavender.
- Builder: keep the left add-candidate sidebar independent from the Builder Workshop scroll.
- Builder: split Builder Workshop and Guide Blocks so the Workshop contents remain readable while Guide Blocks can scroll independently.
- Collections: split the left collection navigation and the right Collections workspace so they do not scroll together.

## Requirements

- Keep existing workflows, data, and controls unchanged.
- Apply desktop split-pane behavior without creating mobile nested scroll traps.
- Reuse the Explore split-pane pattern where possible.
- Preserve Builder mobile sticky actions.
- Keep changes scoped to `public-app` UI structure/CSS and harness artifacts.

## Technical Approach

- Reverse `--accent-gradient` stops to dark-to-light.
- Add pane-specific classes in `App.jsx`:
  - Builder: `builder-sidebar`, `builder-content`, `builder-workshop-pane`, `builder-guide-pane`, `builder-inspector`
  - Collections: `collections-sidebar`, `collections-content`, `collections-inspector`
- On desktop (`min-width: 981px`):
  - Make `.workspace.builder` and `.workspace.collections` viewport-bounded like Explore.
  - Give sidebar/content/inspector panes independent scroll behavior.
  - Make `.builder-content` a two-row grid: Workshop upper pane and Guide Blocks lower pane.
  - Make only `.builder-workshop-pane` and `.builder-guide-pane` scroll internally.
- On mobile:
  - Keep the current single-column behavior.
  - Avoid fixed-height internal panes.

## Verification

- `npm run build`
- `npm run check`
- `git diff --check`
- Static checks for the new pane classes and reversed gradient.
- Local server HEAD check.

## Scope Exclusions

- Prompt editor redesign.
- Guide Blocks feature changes.
- Collections information architecture changes.
- Git push.
