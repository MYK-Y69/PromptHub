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
