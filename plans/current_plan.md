# Implementation Plan

## Intake Summary

Build a fully separated public PromptHub app based on the approved mockup direction. The current legacy `app/` is not a dependency and must not be modified by this build. The product goal is a repeatable workflow:

```text
Explore -> Builder Workshop -> Collections -> reuse in Builder
```

## Quality Governance

- Single-agent review scores are not accepted as final scores.
- Plan and implementation scoring must be performed by separate subagents when the tool is available.
- If subagents are unavailable, the score remains pending and cannot be used as a pass gate.
- For this repair loop, the accepted independent scores are:
  - Plan Review: 78/100, Fail before revision.
  - UX Implementation Review: 72/100, Fail.
  - Technical Implementation Review: 81/100, No-go.

## Requirements

- Keep the public app isolated under `public-app/`.
- Runtime must not depend on `app/` or repository-relative legacy paths.
- Use real PromptHub compiled prompt data as the accepted runtime path.
- Keep sample data only as an emergency/dev fallback, not as a successful public state.
- Explore must support major and middle categories, search, target/source/user/favorite filters, visible empty/loading/error states, tag detail, copy, favorite, hide, and add-to-builder actions.
- Builder Workshop must support Positive/Negative prompt editing, candidate search, Guide Blocks, output copy, save recipe, reorder, duplicate warning, and clear actions.
- Collections must support explicit section switching, selected recipe inspection, load/copy/rename/duplicate/export/delete, favorites, recent prompts, custom Guide Blocks, user tags, and JSON backup.
- Settings must support Sensitive gating, display preferences, local data import/export/reset, hidden tags, legacy import, and data status.
- Sensitive vocabulary is OFF by default.

## Data Source And Acceptance

- Source of truth for this public app build: `data/v2/compiled/tags.json`.
- `public-app/scripts/sync-data.mjs` copies that file to `public-app/public/data/tags.json` before dev/build.
- Runtime loads `data/tags.json` through `import.meta.env.BASE_URL`, with Vite `base: "./"` so root and subpath hosting both work.
- Acceptance check: production `dist/data/tags.json` must contain the compiled data count, at least 1,000 non-sensitive initial Explore tags, and at least 100 non-empty dictionary sections.
- Current verified dataset: 10,085 tags, 9 major categories, 606 non-empty sections, 9,477 initial non-sensitive Explore tags.

## UI Structure

- Desktop Explore: left category rail, center search/results table, right tag inspector and draft summary.
- Mobile Explore: full horizontal major category strip including "all", plus full active middle-category strip. No sliced-only taxonomy access.
- Builder: left candidate rail, center prompt editor and Guide Blocks, right output/save inspector.
- Collections: left collection section rail, center selected section list/editor, right selected recipe inspector.
- Settings: sidebar plus grouped settings rows.
- All primary lists must have empty states.
- Table row selection must be keyboard-operable.
- Editing repeat-use data must use inline forms, not browser `prompt()`.
- Focus states must be visible.

## Component And Module Boundaries

Current construction keeps the app in `public-app/src/App.jsx` for the first working pass, but production hardening should split without behavior changes into:

- data loader / normalizer
- local storage adapter and import validators
- shared tag/prompt utilities
- `ExploreView`
- `BuilderView`
- `CollectionsView`
- `SettingsView`
- shared table, panel, and edit form components

The large `App.jsx` file is an accepted short-term construction risk, not a final maintainability target.

## Repair Scope

Repair loop 1 addresses the independent reviewer findings:

- Configure relative Vite base for subpath deployment.
- Remove repository-relative runtime data fallback.
- Add strict local import normalization for recipes, blocks, tags, draft, favorites, recent prompts, hidden tags, and preferences.
- Wrap localStorage writes so quota/security failures do not crash the UI.
- Cap one-click generated dictionary Guide Block additions to avoid huge prompts from sections with hundreds of tags.
- Replace mobile sliced category shortcuts with full category and subcategory access.
- Make Collections sidebar buttons stateful.
- Make recipe selection explicit and drive the inspector from the selected recipe.
- Replace browser `prompt()` edit flows with inline forms.
- Route table copy through the common copy helper.
- Add keyboard selection, `aria-selected`, labels, `aria-pressed`, and focus-visible styling.
- Expand static checks for data source, subpath base, no prompt dialogs, import validators, Collections state, and Guide Block cap.

## Verification Plan

- `npm run build` in `public-app/`.
- `npm run check` in `public-app/`.
- `git diff --check`.
- Verify Vite dev or preview responds locally when available.
- Verify `/data/tags.json` or relative `data/tags.json` resolves in served output.
- Use subagent implementation review after repair; accept the lowest independent score as the current gate.

## Out Of Scope

- Replacing the legacy `app/`.
- Editing dictionary pipeline tools.
- User accounts, cloud sync, collaboration, billing, or telemetry.
- Full component split before the current repair score is known.
- Git push without explicit user approval.
