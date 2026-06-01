# Current PromptHub Audit

## Repository State

- Working repository: `/Users/nil-origin/PromptHub`
- Starting branch: `main`
- Backup branch created: `backup/current-prompthub-before-select-builder`
- Work branch created: `feature/select-prompt-builder`
- Package manager: none detected; this is a static HTML/CSS/JS app.
- Existing untracked files were present before this task and must not be disturbed: `.DS_Store`, `.claude/settings.json`, `AGENTS.md`, `data/.DS_Store`, `data/v2/sheets_import_log.jsonl`, `data2/`, `imports/.DS_Store`.

## Current Directory Structure

- `app/`: browser app files.
- `data/v2/compiled/tags.json`: main v2 compiled tag dictionary loaded by the app.
- `data/v2/tags.json`: v2 source-ish tag data.
- `data/dictionary/`: legacy compiled dictionaries.
- `tools/`: import/compile/migration scripts.
- `docs/`: project documentation.

## Major Files

- `app/index.html`: static app shell, sidebar, filter bar, Prompt Builder bar, saved prompt panel, record list, index panel, context menu, save dialog, tag-add dialog.
- `app/app.js`: data loading, category navigation, record rendering, builder, saved prompts, local tag addition, import/export, delete/hide behavior.
- `app/app.css`: layout, visual style, builder, saved prompt panel, dialogs, record list, responsive-relevant styling.
- `data/v2/compiled/tags.json`: large compiled category/tag dataset with `categories -> subcategories -> sections -> tags`.

## Existing Builder

- `builderTags` is an ordered array of objects shaped like `{ en }`.
- Clicking a record's `+` button calls `addToBuilder(tag.en)`.
- The Builder bar renders chips with remove buttons.
- `COPY` joins `builderTags.map(t => t.en)` with `, ` and copies it.
- `CLEAR` empties `builderTags`.
- `保存` opens a save dialog and stores the current builder content.

## Existing Data Structure

Main loaded data:

```json
{
  "schema_version": "2.1",
  "categories": [
    {
      "id": "camera",
      "label": "カメラ・構図",
      "subcategories": [
        {
          "id": "cam_framing",
          "label": "構図・カメラ",
          "sections": [
            {
              "id": "camera_comp",
              "label": "構図",
              "tags": [
                {
                  "en": "full body",
                  "jp": "全身...",
                  "target": null,
                  "target_note": null
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

User-added tags:

```json
{
  "en": "english tag",
  "jp": "日本語",
  "catId": "camera",
  "scId": "optional",
  "scLabel": "optional",
  "secId": "section id",
  "secLabel": "section label",
  "target": "self|other|mutual|object|null",
  "target_note": "optional",
  "addedAt": "ISO timestamp"
}
```

## LocalStorage / Import / Export

- `prompthub_deleted`: array of deleted tag keys; used to hide tags locally.
- `prompthub_saved`: saved prompt entries.
- `prompthub_user_tags`: user-added tag entries.
- Saved prompt export downloads `prompthub_saved_YYYY-MM-DD.json`.
- Saved prompt import accepts an array with `id`, `name`, `tags`, and avoids duplicate ids.
- User tag export downloads `prompthub_user_tags_YYYY-MM-DD.json`.
- User tag import accepts user-tag arrays, avoids duplicate `en`, injects entries into the loaded in-memory data.

## Saved Prompt Spec

Saved prompts are stored as:

```json
{
  "id": "Date.now string",
  "name": "display name",
  "tags": [{ "en": "tag" }],
  "savedAt": "ISO timestamp"
}
```

The saved list can load a prompt into `builderTags` or delete it after confirmation.

## Features That Must Not Break

- Existing tag records are visible after data load.
- Global search across `en` and `jp`.
- Target filters.
- Existing Prompt Builder add/remove/COPY/CLEAR.
- Builder save dialog and saved prompt load/delete.
- Saved prompt export/import.
- Tag addition dialog.
- User-added tag export/import.
- Context-menu copy/add/delete.
- Category sidebar and right index panel.

## Minimum Change Target

Add an independent selectable prompt builder panel without replacing existing builder logic:

- MVP categories: character, pose, expression, angle, background.
- Positive and negative prompt generation.
- Copy and clear controls.
- Usage counts with `last_used_at` persisted in LocalStorage.
- Sorting by usage count within each category.
- Keep existing saved/import/export data shapes backward-compatible.

## Risks

- The app is static and has no automated test suite; verification must combine syntax checks, local HTTP serving, and browser interaction.
- `data/v2/compiled/tags.json` is large; do not rewrite it.
- Existing saved prompt import only validates a loose array shape; new generated prompt state should use a new LocalStorage key and not alter saved prompt records.
- Clipboard calls may fail in non-secure contexts; existing fallback is limited to `copyToClipboard`.
- Mobile layout currently uses a 3-column grid; the new panel must not make narrow widths worse.
