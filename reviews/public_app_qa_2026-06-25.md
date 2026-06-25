# PromptHub Public App QA - 2026-06-25

## Scope

- Target: `public-app` at local Vite URLs `http://127.0.0.1:5176/` and isolated QA URL `http://127.0.0.1:5180/`.
- Method: ui-build-harness review loop with main-agent manual QA, independent subagent QA, static build checks, and CDP-driven browser regression checks.
- Data: compiled PromptHub tags, 10,085 total tags / 9 categories / 606 sections / 9,477 initial Explore tags.

## Coverage

- Explore: initial load, category and subcategory switching, empty states, all-category reset, search, target/source/favorite/user filters, show more, hide tag, mobile Explore screenshot.
- Builder: draft editing, candidate search/add, Guide Block search/add, copy actions, save recipe, duplicate-key console regression.
- Collections: recipes, favorites, recent prompts, custom Guide Blocks, user tags, rename/edit/delete flows, duplicate user-tag handling, mobile overflow.
- Settings: sensitive toggle, density/language/inspector toggles, hidden tag management, import/export/reset affordances.

## Findings Fixed

- Explore empty-state heading could show a stale subcategory label when no rows were visible.
- Dictionary Guide Blocks could generate duplicate React keys when source section IDs repeated.
- Mobile Collections recipe table overflowed horizontally.
- Duplicate user-tag submission cleared the form even though the add failed.
- Custom Guide Block and user-added tag deletion had no confirmation.

## Verification

- `npm run build`: passed.
- `npm run check`: passed.
- `git diff --check`: passed.
- CDP regression QA: 5/5 passed.
  - Duplicate-key console errors: 0.
  - Mobile Collections: document scroll width matched client width.
  - Duplicate user-tag form values were preserved.
  - Custom Guide Block delete required confirmation.
  - User-added tag delete required confirmation.

## Notes

- The in-app browser test tab became unstable after repeated confirm-dialog experiments; final interactive regression checks were completed in a disposable headless Chrome CDP session instead.
- The user's visible `5176` app session was not intentionally reset; destructive checks were run in isolated QA state or with disposable Chrome.
