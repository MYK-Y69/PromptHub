# Implementation Review

## Governance

Single-agent implementation scores are withdrawn and must not be used as a pass gate. The accepted implementation gate is based on independent subagent review, with the lowest credible implementation score treated as the current score.

## First Independent Reviews

### UX Implementation Reviewer

Total: 72 / 100

Gate: Fail. Repair loop required before public-app UX can ship.

Key defects:

- Mobile Explore hid most category navigation.
- Collections sidebar buttons were inert and the inspector always showed the first visible recipe.
- Repeat-use editing used browser `prompt()` dialogs.
- Explore search button was a false affordance.
- Keyboard/accessibility coverage was weak.
- Table copy bypassed the shared copy helper.
- `App.jsx` was too large for production hardening.

### Technical Verification Reviewer

Total: 81 / 100

Gate: No-go for public deployment.

Verified before repair:

- `npm run build`: pass.
- `npm run check`: pass.
- `git diff --check`: pass.
- Served output and `data/tags.json`: pass.
- Headless Chrome rendered compiled Explore data.

Key defects:

- Vite default base risked breaking project-path hosting.
- Runtime import/localStorage accepted malformed arrays without schema validation.
- Generated dictionary Guide Blocks could add hundreds of tags in one click.
- Static check coverage was too shallow.

## Current Gate

Repair loop required. Current accepted implementation score before repair: 72 / 100.

## Repair Loop 1

Implemented repairs:

- Set Vite `base: "./"` for subpath-safe output.
- Removed repository-relative runtime data fallback.
- Added strict import normalization for favorites, recipes, recent prompts, custom blocks, user tags, hidden tags, draft, and preferences.
- Wrapped localStorage writes to avoid quota/security crashes.
- Capped generated dictionary Guide Block one-click additions at 40 tags.
- Replaced mobile category slices with full major category access and full active subcategory access.
- Changed Explore search action to `Clear`.
- Routed table-row copy through `copyText()`.
- Added keyboard-operable tag and recipe row selection with `aria-selected`.
- Added `aria-pressed` to segmented/toggle controls.
- Added labels to read-only prompt textareas.
- Added visible `:focus-visible` styling.
- Made Collections sidebar section buttons stateful.
- Added explicit selected recipe state and inspector linkage.
- Replaced `prompt()` edit flows with inline forms for recipes, custom Guide Blocks, and user tags.
- Expanded `npm run check` for data source, subpath base, no prompt dialogs, import validators, Collections state markers, and Guide Block cap.

## Verification After Repair Loop 1

| Command / Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | Pass | Synced 10,085 tags and built Vite production output. The environment printed `pyenv` shim warnings, but the build completed. |
| `npm run check` | Pass | Confirmed 10,085 tags, 9 categories, 606 sections, 9,477 initial non-sensitive Explore tags, relative base/data checks, import validators, no prompt dialogs, and Guide Block cap markers. |
| `git diff --check` | Pass | No whitespace errors. |
| Static risk scan | Pass | No `window.prompt(`, direct table clipboard bypass, or sliced mobile category shortcuts remain. |

## Pending

Repair loop 2 and independent post-repair implementation review completed.

## Repair Loop 2

Implemented repairs:

- Routed existing localStorage reads through schema-specific normalizers using `readNormalizedJson`.
- Added `normalizeImportedRecentPrompts`, `normalizeImportedPreferences`, and `normalizeImportedDraft`.
- Added safe `removeJson` and used it in `resetLocalData`.
- Changed the Collections recipe table to render `visibleRecipes`, so Sensitive OFF hides known sensitive recipe names rather than showing locked rows.
- Extended `npm run check` to assert normalized localStorage reads, safe reset, and `visibleRecipes` recipe rendering.
- Staged public-app source/config files while keeping `node_modules`, `dist`, `.npm-cache`, and generated `public/data/tags.json` ignored.

## Final Independent Reviews

### UX Implementation Reviewer

Total: 86 / 100

Gate: Pass for public user testing.

Remaining risks:

- Browser `confirm()` dialogs remain for destructive actions.
- Mobile is usable but cramped.
- `App.jsx` remains large.

### Technical Verification Reviewer

Total: 89 / 100

| Criterion | Score |
| --- | ---: |
| Requirements achievement | 23 / 25 |
| UI/UX quality | 17 / 20 |
| Code quality | 17 / 20 |
| Verification | 14 / 15 |
| Maintainability | 8 / 10 |
| Accessibility | 5 / 5 |
| Lack of overengineering | 5 / 5 |

Gate: Pass.

Verified:

- `npm run build`: passed, synced 10,085 tags and built Vite output.
- `npm run check`: passed, reporting 10,085 tags, 9 categories, 606 sections, and 9,477 initial Explore tags.
- `git diff --check -- public-app`: passed.
- `git diff --cached --check -- public-app`: passed.
- `git status --short --untracked-files=all public-app`: public-app source/config files staged, generated/cache files ignored.

## Final Gate

Pass. Lowest independent post-repair score: 86 / 100.

## Residual Risks

- `public-app/src/App.jsx` is still a large single-file implementation and should be split before production hardening.
- Static checks are partly marker-based and do not replace browser-level interaction tests.
- Sensitive recipe hiding depends on exact matches against loaded dictionary records; freeform imported sensitive terms outside the dictionary cannot be classified automatically.

---

# Guide Blocks Improvement Review

## Scope

Guide Blocksの存在意義を「辞書セクションの一覧」から「よく使うプロンプト部品をBuilderへ戻す再利用ショートカット」に変更した。対象はBuilderのGuide Blocks、Recipe保存、CollectionsのQuick reuse、関連localStorage/check script。

## Independent Implementation Review

Reviewer: Carver

Total: 87 / 100

Gate: Pass

| Criterion | Max | Score |
| --- | ---: | ---: |
| Requirements fit | 25 | 23 |
| UI/UX | 20 | 18 |
| Technical correctness | 20 | 16 |
| Maintainability | 15 | 12 |
| Verification coverage | 10 | 8 |
| Scope control | 10 | 10 |

## Review Findings

- P2: Sensitive Guide Blocks could bypass Sensitive OFF via Pinned / Recently used / My Blocks shortcuts.
- P3: New workflow checks in `check-app.mjs` are marker-based and do not replace browser-level interaction tests.

## Repair Applied

- Applied the same Sensitive OFF filtering to `pinnedBlocks`, `recentBlocks`, and `myBlocks`.
- Added `visibleGuideBlock` static check markers so shortcut filtering cannot be accidentally removed without `npm run check` failing.

## Browser QA

Manual browser verification was run against `http://127.0.0.1:5176/`:

- Builder renders Guide Blocks purpose copy.
- Pinned / Recently used / My Blocks are visible.
- Pin from Library reflects in Pinned.
- Adding a Guide Block updates Recently used.
- Creating a block from Draft reflects in My Blocks.
- Recipe name field saves a named recipe.
- Collections shows Load / Copy Both / Copy Positive.
- Copy Positive and Copy Both write expected clipboard text.
- Desktop Builder and Collections had no horizontal overflow.
- Mobile Builder and Collections at 390px width had no horizontal overflow.
- Browser console error/warning log was empty during interaction checks.

## Verification After Repair

| Command / Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | Pass | Synced 10,085 tags and built production output. Environment printed `pyenv` shim warnings only. |
| `npm run check` | Pass | Confirmed compiled data counts plus new Guide Blocks workflow markers and Sensitive shortcut filtering marker. |
| `git diff --check` | Pass | No whitespace errors. |
| Browser smoke after repair | Pass | Builder loaded after reload with Guide purpose, shortcut sections, Guide cards, and no horizontal overflow. |

## Current Gate

Pass. Independent score: 87 / 100. P2 repair was applied and verified after the score.

## Residual Risks

- New browser-level workflow verification is documented but not yet automated as an npm script because the public app currently has no browser automation dependency.
- `public-app/src/App.jsx` remains large; component splitting should be considered before long-term maintenance.
