# Implementation Plan

## Intake Summary

Build a selectable prompt builder MVP inside current PromptHub. It must preserve existing tag browsing, Builder, saved prompts, import/export, tag addition, and Target filtering. New UI should let the user choose character, pose, expression, angle, and background blocks, then generate SeaArt-ready positive and negative prompts.

## Assumptions

- Work target is `/Users/nil-origin/PromptHub`, because it contains saved prompts, import/export, tag addition, and Target filtering.
- No SeaArt automation or external service integration will be added.
- MVP prompt blocks can be bundled as static JS constants to avoid changing the large compiled dataset.
- Usage stats should use a new LocalStorage key and must not mutate existing saved prompt or tag data.

## Screen Structure

- Keep existing app shell.
- Add a `Selectable Builder` panel between the saved prompt panel and record list.
- The panel contains a compact header, search field, category tabs, block cards, selected items, Generate/Copy/Clear controls, and Positive/Negative output fields.

## Component Structure

- Static prompt block data: `SELECT_BLOCKS`.
- State: selected blocks by category, active selectable category, selectable search, generated positive/negative strings, usage stats.
- Render functions:
  - `renderSelectBuilder()`
  - `renderSelectCategoryTabs()`
  - `renderSelectBlocks()`
  - `renderSelectedBlocks()`
  - `renderGeneratedPrompts()`
- Actions:
  - select/unselect block
  - generate prompts
  - copy generated prompts
  - clear selected builder
  - increment usage stats

## State Management

- New LocalStorage key: `prompthub_select_builder_usage`.
- Usage shape:

```json
{
  "block_id": {
    "usage_count": 2,
    "last_used_at": "ISO timestamp"
  }
}
```

- Existing keys remain unchanged.

## Data Model / Data Flow

Prompt block:

```json
{
  "id": "himesaki_rinami",
  "category": "character",
  "label": "姫崎莉波",
  "prompt": "trigger words, hairstyle, hair color...",
  "negative_prompt": "",
  "favorite": false,
  "enabled": true
}
```

Generate joins selected positive blocks in this order:

1. character
2. pose
3. expression
4. angle
5. background

Negative prompt joins all selected block `negative_prompt` values plus a default negative block.

## Technical Approach

- Modify only `app/index.html`, `app/app.js`, and `app/app.css`, plus docs/reviews/plans.
- Use plain DOM APIs consistent with the current app.
- Add no dependencies.
- Do not change `data/v2/compiled/tags.json`.
- Preserve existing builder function names and LocalStorage shapes.

## UI / UX Approach

- Compact panel matching PromptHub's existing dense tool UI.
- Category tabs show selected/total status.
- Cards show label, prompt preview, usage count, and favorite marker.
- Selected items are shown as removable chips.
- Positive and Negative outputs use textarea fields for SeaArt copy/paste.

## Accessibility Approach

- Use buttons for selectable blocks and actions.
- Add labels for search and output textareas.
- Keep keyboard focusable controls.
- Ensure disabled buttons reflect unavailable actions.

## Responsive Approach

- On narrow screens, stack sidebars and main content via CSS media query.
- Selectable builder controls wrap instead of overflowing.
- Output areas use fixed minimum heights and full width.

## Verification Plan

- Syntax check with `node --check app/app.js`.
- Serve locally with `python3 -m http.server 8000`.
- Browser verification:
  - records render
  - existing builder add/copy/clear works
  - saved prompt save/export/import controls exist
  - tag add dialog opens
  - selectable category selection works
  - Generate creates positive/negative prompts
  - Copy works
  - Clear works
  - usage_count persists across reload
  - mobile width does not heavily break

## Work Sequence

1. Add selectable builder markup.
2. Add prompt block constants, state, render/action functions.
3. Wire event listeners.
4. Add CSS for desktop and mobile.
5. Run local syntax/server/browser verification.
6. Save implementation review and score.
7. Repair only MVP blockers if score is under threshold.
8. Commit locally without push.

## Risks and Mitigations

- Risk: existing Builder behavior changes. Mitigation: leave existing Builder state and functions intact.
- Risk: import/export incompatibility. Mitigation: new feature uses separate LocalStorage and does not alter import/export schemas.
- Risk: panel increases vertical clutter. Mitigation: compact controls and scroll-friendly card row.
- Risk: no package build. Mitigation: use syntax check and browser verification.

## Out of Scope

- SeaArt API/CLI/browser automation.
- Main/production merge.
- Push/deploy.
- Large data migration.
- Dependency additions.
