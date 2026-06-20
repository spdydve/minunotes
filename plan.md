# Plan: note links and backlinks

## Goal
Add Obsidian-style note links to MinuNotes with durable link indexing. Start with `[[Note Title]]` wikilinks and backlinks, then leave graph/internal URL polish for later phases.

## MVP scope
- Support wikilinks in note content:
  - `[[Note Title]]`
  - `[[Note Title|Display Label]]`
- Index outgoing note links whenever a note is created or updated through app/harness paths.
- Resolve links by `userId` + target note title.
- Store unresolved links with `targetNoteId = null`.
- Show backlinks on the note detail page.
- Do not implement graph view in this phase.
- Do not implement rich editor wikilink rendering in this phase unless it is low-risk with current MinuEditor APIs.

## Files to modify/create

### Database
- `src/api/db/schema.ts`
  - Add `noteLinks` table.
- `drizzle/0017_note_links.sql`
  - Add migration.
- `drizzle/meta/_journal.json`
  - Register migration.

### Link parsing/indexing
- New file: `src/api/notes/links.ts`
  - Parse wikilinks.
  - Resolve target notes by title.
  - Rebuild outgoing links for a source note.
  - Fetch backlinks for a target note.
- Tests:
  - New `tests/note-links.test.ts` or similar.

### Backend integration
- `src/api/harness/commands.ts`
  - Reindex links after create/update/edit operations that change note content/title.
  - Re-resolve unresolved links when a note title is created/changed.
- `src/api/routes/notes.ts`
  - Add endpoint:
    - `GET /api/notes/:noteId/backlinks`
  - Possibly add outgoing links endpoint later if needed.

### Frontend
- `src/frontend/lib/api.ts`
  - Add backlink response type and helper.
- New file: `src/frontend/components/backlinks-panel.tsx`
  - Show source note title, optional matched link label/title, and navigate to source note.
- `src/frontend/routes/notes.$noteId.tsx`
  - Render backlinks panel below/near editor metadata or in a compact section.

## Implementation checklist

### Phase 1 — Link parser and DB index
- [x] Add `note_links` schema and migration.
- [x] Add wikilink parser for `[[Title]]` and `[[Title|Label]]`.
- [x] Add tests for parser edge cases.
- [x] Add link reindex function that replaces outgoing links for one source note.
- [x] Add tests for resolved and unresolved links.

### Phase 2 — Reindex integration
- [x] Reindex links after app note create/update/edit.
- [x] Reindex links after harness note create/edit.
- [x] Re-resolve unresolved links when matching notes are created or renamed.
- [x] Add/update integration tests.

### Phase 3 — Backlinks API/UI
- [x] Add `GET /api/notes/:noteId/backlinks`.
- [x] Add API helper/type in frontend client.
- [x] Add backlinks panel component.
- [x] Show backlinks on note page.
- [x] Add API tests for ownership and backlink results.

### Phase 4 — Polish/deferred decisions
- [x] Decide whether unresolved wikilinks should create notes in this iteration or remain indexed only.
- [x] Decide whether current MinuEditor can safely render wikilinks as clickable links without package changes.
- [x] Leave graph view for later.

## Verification
- [x] `pnpm db:migrate`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] Manual: create Note A with `[[Note B]]`; Note B shows backlink from Note A.
- [ ] Manual: create Note A with `[[Missing Note]]`; unresolved link is indexed without breaking save.
- [ ] Manual: create/rename Missing Note to matching title; backlink resolves.
- [ ] Manual: another user cannot see backlinks to/from notes they do not own.

## Open decisions before implementation
- Should title matching be case-sensitive or case-insensitive? Recommendation: case-insensitive for resolution, preserve original text in `targetTitle`.
- Should duplicate note titles resolve to the most recently updated note, oldest note, or remain unresolved? Recommendation: resolve only when exactly one matching title exists; otherwise unresolved.
- Where should backlinks appear in the note UI? Recommendation: compact panel below the header/editor area, collapsed or subtle when empty.
