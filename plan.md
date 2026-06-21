# Tags + Note Details Implementation Plan

## Goal
Add first-class tags and a lightweight note details panel without adding a Notion-style custom properties/database system.

## Scope
- Explicit note tags stored in the database.
- Tag read/update/filter support in app API and harness API.
- Note details/info UI for built-in note metadata and tags.
- No arbitrary key/value properties, folder schemas, formulas, relations, or database views.

## Files to modify/create

### Database
- `drizzle/0018_note_tags.sql` — create tag tables/indexes.
- `drizzle/meta/_journal.json` — register migration.
- `src/api/db/schema.ts` — add `tags` and `noteTags` schema + relations.

### API/domain
- `src/api/notes/tags.ts` — tag normalization, list/set helpers, note serialization helpers.
- `src/api/routes/notes.ts` — add note tag endpoints and optional tag filtering.
- `src/api/routes/harness.ts` — add harness tag endpoints/filtering with folder permission checks.
- `src/api/harness/commands.ts` — include tags in note read/search/create/update results where appropriate.
- `src/api/openapi/harness.ts` — document harness tag endpoints/filtering.

### Frontend
- `src/frontend/lib/api.ts` — add tag types and client methods.
- `src/frontend/components/note-details-dialog.tsx` — built-in details panel/dialog.
- `src/frontend/components/note-actions-popover.tsx` — add “Details” action.
- `src/frontend/routes/notes.$noteId.tsx` — pass data/update hooks to details UI and refresh note caches.
- Potentially `src/frontend/styles.css` only if tag chips/details need shared styles.

### Tests
- `tests/note-tags.test.ts` — app API tag CRUD/filtering and harness permission behavior.
- `tests/openapi.test.ts` — harness OpenAPI path coverage.
- Update existing tests if note response shape changes.

## Proposed data model

### `tags`
- `id`
- `user_id`
- `name` — display name
- `normalized_name` — lower/trim/collapsed spacing, unique per user
- `created_at`
- `updated_at`

### `note_tags`
- `id`
- `user_id`
- `note_id`
- `tag_id`
- `created_at`
- unique `(note_id, tag_id)`
- indexes on `user_id`, `note_id`, `tag_id`

## Proposed API

### App API
- `GET /api/tags` or `GET /api/notes/tags` — list user tags with counts if cheap.
- `GET /api/notes/:noteId/tags` — list tags on a note.
- `PUT /api/notes/:noteId/tags` — replace tags for a note with `{ tags: string[] }`.
- `GET /api/notes/search?q=...&tag=...` — optional tag filter.
- Consider `GET /api/notes/recent?tag=...` only if needed.

### Harness API
- `GET /api/harness/tags` — list visible tags, filtered by readable folders if possible.
- `GET /api/harness/notes/:noteId/tags` — list note tags after read permission check.
- `PUT /api/harness/notes/:noteId/tags` — replace note tags after edit permission check.
- `GET /api/harness/notes/search?q=...&tag=...` — tag filter, still folder-permission filtered.

## UI proposal

### Details dialog/panel
Open from note actions as “Details”. Show built-in metadata only:
- Title
- Folder
- Type: Note/Template
- Created at
- Updated at
- Updated by
- API editable
- Share status/link access summary
- Tags editor

### Tags editor
- Simple chip input.
- Existing tag autocomplete if available.
- Save on explicit submit or debounced update; prefer explicit Save for first version.
- Normalize duplicates client-side and server-side.

## Verification steps
- `pnpm typecheck`
- `pnpm test tests/note-tags.test.ts tests/openapi.test.ts`
- `pnpm test`
- `pnpm build`
- Manual checks:
  - Add/remove tags from note details.
  - Tags persist after reload.
  - Search/filter by tag returns expected notes.
  - Harness can read/update tags with authorized key.
  - Harness cannot read/update tags outside allowed folders.
  - Details dialog shows expected built-in metadata and does not expose custom properties.

## Open questions
- Endpoint naming: `/api/tags` vs `/api/notes/tags`.
- Whether note read/search responses should include tags by default or load tags separately.
- Whether tag filtering should support multiple tags initially.
- Whether templates should support tags in MVP.
