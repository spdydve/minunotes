# Version History and Restore Plan

## Goal

Add restorable note history without letting storage grow uncontrollably.

The main product reason is safety, especially around agent edits. Users should be able to inspect prior states and restore if an edit goes wrong.

## Non-goals

- Do not snapshot every keystroke/autosave.
- Do not implement diff-based storage initially.
- Do not build a full Google Docs-style revision UI for MVP.
- Do not keep infinite history.

## Recommended model

Use the existing `note_events` table as the audit/event log, and add a separate `note_versions` table for restorable snapshots.

`note_events` answers:

- What happened?
- Who/what made the change?
- When did it happen?
- What was the summary?

`note_versions` answers:

- What did the note look like at a restorable point in time?

## Snapshot strategy

Create snapshots only when meaningful.

Recommended initial snapshot triggers:

- On note creation.
- Before agent edits that change content/title/tags/details.
- Before large/destructive user edits if detectable.
- During normal user autosave only if the last snapshot is older than a time threshold, such as 10 minutes.
- Before restore, so the state being replaced can itself be recovered.

Avoid creating a snapshot for every autosave. Autosave can continue frequently, but version snapshots should be coarser.

## Deduplication

Before writing a snapshot:

1. Compute a hash of the restorable state.
2. Compare it with the latest version hash for the note.
3. If unchanged, do not create a new version.

Initial restorable state can include:

- title
- content
- folder ID
- created date
- API editable flag
- tags

If tags complicate the MVP, start with title/content/folder/API editable and add tags later.

## Storage format

Start with plain snapshots, not diffs.

Plain snapshots are easier to:

- write
- read
- restore
- test
- reason about during incidents

If storage becomes an issue later, consider compression before considering diffs.

## Retention limits

Use bounded retention.

Recommended MVP retention:

- Hard cap: keep at most 100 versions per note.
- Delete oldest non-pinned versions above the cap.
- Keep pinned versions indefinitely if pinning is later added.

Possible future retention policy:

- Keep all versions for the last 7 days.
- Keep daily versions for 30 days.
- Keep weekly versions for 6–12 months.
- Still enforce a maximum cap per note or per workspace.

For MVP, a simple per-note cap is enough.

## Agent safety rules

Agent edits deserve stronger protection.

Recommended rules:

- Always create a pre-edit snapshot before an agent edit that changes restorable state.
- Label the snapshot reason as `before_agent_edit`.
- Optionally create an after-edit snapshot if useful, but the pre-edit snapshot is the critical safety mechanism.
- Include actor type and actor ID on versions when possible.

This lets users recover from a bad agent edit without needing to reconstruct history from events.

## Proposed table

Example `note_versions` fields:

- `id`
- `user_id`
- `note_id`
- `title`
- `content`
- `folder_id`
- `created_at_value` — the note's editable created date at that version
- `is_api_editable`
- `tags_json` — optional for MVP, can be added later
- `state_hash`
- `reason` — `create`, `autosave_checkpoint`, `before_agent_edit`, `before_restore`, `manual`
- `actor_type` — `user`, `agent`, `system`
- `actor_id`
- `created_at` — when the version snapshot was created

Indexes:

- `(user_id, note_id, created_at)`
- `(note_id, created_at)`
- `(note_id, state_hash)`

## API proposal

App API:

```txt
GET /api/notes/:noteId/versions
GET /api/notes/:noteId/versions/:versionId
POST /api/notes/:noteId/versions/:versionId/restore
```

Harness API, if needed:

```txt
GET /api/harness/notes/:noteId/versions
GET /api/harness/notes/:noteId/versions/:versionId
POST /api/harness/notes/:noteId/versions/:versionId/restore
```

Harness restore should require edit permission and respect `isApiEditable` for agent keys.

## Restore behavior

When restoring:

1. Read current note state.
2. Create a `before_restore` snapshot of the current state.
3. Apply the selected version to the current note.
4. Record a `restore` note event.
5. Reindex note links and attachment references if content changed.
6. Return the updated note and content hash.

Restore should create a new current state, not rewrite history.

## UI MVP

Start in the note activity/details area.

Possible first UI:

- Version list with timestamp, actor, and reason.
- View selected version.
- Restore button with confirmation.

Nice-to-have later:

- Diff current vs selected version.
- Pin important versions.
- Filter by actor/user/agent.

## Open questions

- Should tags be included in the first restorable state?
- Should title/details-only changes create snapshots or only content changes?
- Should user autosave checkpoints be 10 minutes, 15 minutes, or manual only?
- Should version restore be exposed to agents initially, or app UI only?

## Suggested MVP

1. Add `note_versions` snapshots.
2. Snapshot on create.
3. Snapshot before agent edits.
4. Snapshot user edits only if the last version is older than 10 minutes and state changed.
5. Deduplicate by state hash.
6. Cap at 100 versions per note.
7. Add app UI to view and restore versions.
8. Defer diffs, pinning, and complex retention.
