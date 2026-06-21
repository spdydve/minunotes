# Version History + Restore Implementation Plan

## Goal
Add bounded, restorable note history focused on safety, especially before agent edits and restores, without storing every autosave forever.

## Scope
- [x] Add restorable note snapshots separate from the existing event log.
- [x] Snapshot on note creation, before agent edits, before restore, and periodic user checkpoints.
- [x] Deduplicate snapshots by state hash.
- [x] Enforce a per-note retention cap.
- [x] Add app APIs and UI to list, view, and restore versions.
- [x] Keep the first implementation simple: full snapshots, not diffs.

## Files to modify/create

### Database
- `drizzle/0019_note_versions.sql` — create `note_versions` table and indexes.
- `drizzle/meta/_journal.json` — register migration.
- `src/api/db/schema.ts` — add `noteVersions` schema/relations.

### API/domain
- `src/api/notes/versions.ts` — snapshot, list, read, restore, dedupe, and pruning helpers.
- `src/api/routes/notes.ts` — app version endpoints.
- `src/api/routes/harness.ts` — create pre-agent snapshots around harness edits; optionally expose harness version endpoints if simple.
- `src/api/harness/commands.ts` — ensure command-based edits use the same snapshot path if applicable.
- `src/api/notes/links.ts` — verify restore reindexes links after content changes; likely call existing helpers only.
- `src/api/openapi/harness.ts` — only if harness version endpoints are added.

### Frontend
- `src/frontend/lib/api.ts` — version types/client methods.
- `src/frontend/components/note-versions-dialog.tsx` or `src/frontend/routes/notes.$noteId.activity.tsx` — UI to list/view/restore versions.
- `src/frontend/components/note-actions-popover.tsx` — add “Version history” action if using a dialog.
- `src/frontend/routes/notes.$noteId.tsx` — wire action, restore refresh, and cache invalidation if needed.

### Tests
- `tests/note-versions.test.ts` — snapshot creation, dedupe, retention, restore, reindex behavior.
- `tests/harness.test.ts` or relevant existing harness tests — verify pre-agent edit snapshots and permissions.
- `tests/openapi.test.ts` — only if harness version endpoints are added.

## Proposed data model

### `note_versions`
- `id`
- `user_id`
- `note_id`
- `title`
- `content`
- `folder_id`
- `created_at_value` — note's editable created date at snapshot time.
- `is_api_editable`
- `tags_json` — include tags if low-risk; otherwise defer.
- `state_hash`
- `reason` — `create`, `autosave_checkpoint`, `before_agent_edit`, `before_restore`, `manual`.
- `actor_type` — `user`, `agent`, `system`.
- `actor_id`
- `created_at` — snapshot creation time.

Indexes:
- `(user_id, note_id, created_at)`
- `(note_id, created_at)`
- `(note_id, state_hash)`

## Proposed APIs

### App API
- `GET /api/notes/:noteId/versions` — list version metadata.
- `GET /api/notes/:noteId/versions/:versionId` — read full snapshot.
- `POST /api/notes/:noteId/versions/:versionId/restore` — restore selected version.

### Harness API
MVP option: do not expose restore/list to harness yet. Still create pre-agent snapshots internally.

If added now:
- `GET /api/harness/notes/:noteId/versions`
- `GET /api/harness/notes/:noteId/versions/:versionId`
- `POST /api/harness/notes/:noteId/versions/:versionId/restore`

Harness restore must require edit permission and respect `isApiEditable`.

## Snapshot rules

- Create snapshot on note creation.
- Create `before_agent_edit` snapshot before a harness edit changes restorable state.
- Create `before_restore` snapshot before applying a restore.
- For user autosave/content edits, create `autosave_checkpoint` only if latest snapshot is older than 10 minutes and state changed.
- Never create a snapshot if the computed state hash equals the latest version hash.
- After adding a snapshot, prune old non-pinned versions above 100 per note.

## Restore behavior

1. Check user owns/can edit the note.
2. Load target version.
3. Create `before_restore` snapshot of current note state.
4. Apply version title/content/folder/API editable/details included in MVP.
5. Reindex note links and attachment references if content changed.
6. Record a note event.
7. Return updated note and content hash.

## UI proposal

MVP UI can be a dialog from Note actions:
- “Version history” menu item.
- List versions with timestamp, reason, and actor.
- Select a version to preview content.
- Restore button with confirmation.

Defer visual diffs and pinned versions.

## Verification steps

- [x] `pnpm typecheck`
- [x] `pnpm test tests/note-versions.test.ts`
- [x] `pnpm test tests/note-links.test.ts` via targeted combined run
- [x] `pnpm test`
- [x] `pnpm build`
- Manual checks:
  - Create note creates initial version.
  - Repeated identical saves do not create duplicate versions.
  - Harness edit creates pre-edit version.
  - Restore reverts note content/title and creates a before-restore snapshot.
  - Restored note backlinks/outgoing links are reindexed.
  - Version list never exceeds retention cap after pruning.

## Open questions

- Include tags in MVP snapshots or defer?
- Add harness version list/restore endpoints now or only internal agent safety snapshots?
- Put UI in Activity route or a dedicated Version History dialog?
- Should user checkpoints be exactly 10 minutes or 15 minutes?

## Proposed MVP answer to open questions

- Defer tags unless implementation is very small.
- Do not expose harness version endpoints in MVP; only create pre-agent snapshots.
- Use a Version History dialog from note actions.
- Use 10-minute user checkpoint threshold.
