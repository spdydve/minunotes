# Trash and recovery implementation plan

## Goal

Replace immediate hard deletion of MinuNotes notes, templates, and folders with a recoverable Trash workflow while preserving authorization boundaries, portable Markdown, versions, activity, tags, links, and attachments.

## Execution contract

### Objective

- Move notes, templates, and folder subtrees to Trash instead of physically deleting them.
- Let the owner restore trashed content or permanently delete it from Trash.
- Ensure trashed content is inaccessible from normal application, public-share, harness, MCP, OAuth, and API-key surfaces.
- Explicitly clean up attachment objects during permanent deletion.

### Definition of done

- Active-content queries consistently exclude trashed notes and folders.
- A user can trash and restore a note or template.
- A user can trash and restore a folder subtree without first deleting children.
- Trash has a dedicated authenticated route and sidebar destination.
- Public links stop working immediately when their note or folder is trashed and do not reactivate after restore.
- Permanent deletion is available only from Trash and requires typed confirmation.
- Permanent deletion removes associated attachment objects as well as database records.
- Existing authorization, folder hierarchy, version history, and editor behavior remain intact.
- Required unit, integration, browser, type, formatting, and build checks pass.

### Constraints

- Keep Markdown and canvas source formats unchanged.
- Do not expose delete, restore, or purge operations through harness, MCP, OAuth, or API-key tools in this milestone.
- Preserve note versions and events while an item is in Trash.
- Preserve tags, link records, template assignments, and attachments while recoverable.
- Do not silently reactivate revoked public links after restore.
- Do not add scheduled automatic purge in the first release; show retention language only after a cleanup schedule exists.
- Keep changes phase-bounded and review each phase before advancing.

### Product defaults to implement

- Note/template action label: `Move to Trash`.
- Folder action moves its active subtree to Trash.
- Normal trash actions do not require typing `delete`; permanent deletion does.
- Restore uses the original folder/parent when it is active.
- If a note's original folder is unavailable, require the user to choose an active destination folder.
- If a folder root's original parent is unavailable, restore that root at the top level and explain why.
- Trashing revokes applicable note and folder share links.
- Restoring does not recreate or reactivate those links.
- Automatic 30-day purge is deferred until manual Trash behavior is proven.

## Baseline findings

- `DELETE /notes/:noteId` currently hard-deletes a note and returns success without checking whether a row existed.
- `DELETE /folders/:folderId` hard-deletes notes and then the folder; it blocks folders with direct children and is not expressed as one reusable domain operation.
- Foreign-key cascades currently remove note versions, events, shares, tags, assignments, links, and attachment metadata.
- Incoming note links use `ON DELETE SET NULL`; recoverable deletion must instead hide trashed targets without destroying the relationship.
- Attachment object storage is not explicitly cleaned when a note/folder row cascades away, so current hard deletion can orphan stored files.
- All active note/folder queries currently assume that every row is visible; filtering is distributed across routes, harness commands, link resolution, sharing, and folder-access helpers.
- UI confirmation always requires typing `delete`, closes before mutation success, and has limited pending/error treatment.
- Harness and MCP do not currently expose note/folder deletion.

## Proposed data model

Add nullable Trash metadata to notes and folders:

- `deleted_at` — when the item entered Trash.
- `trash_batch_id` — shared identifier for items moved together as a folder subtree; null for an individually trashed note/template.

Behavior:

- Individual note/template trash sets only its `deleted_at`.
- Folder trash computes the active descendant subtree and marks its folders and active notes with one batch ID.
- Existing independently trashed descendants are not absorbed into a later batch.
- Restore updates only the selected note or the selected folder batch.
- Active queries require `deleted_at IS NULL` and an active folder.
- Permanent folder purge preserves separately trashed descendant roots by detaching them before deleting the selected batch.

Indexes:

- Notes by user/deletion time and trash batch.
- Folders by user/deletion time and trash batch.

## API shape

Retain `DELETE` as the user-facing move-to-Trash action for compatibility:

- `DELETE /notes/:noteId` — move an active note/template to Trash.
- `DELETE /folders/:folderId` — move an active folder subtree to Trash.
- `GET /trash` — list recoverable note/template items and folder trash roots.
- `POST /trash/notes/:noteId/restore` — restore one note/template; accepts a destination folder when the original is unavailable.
- `DELETE /trash/notes/:noteId` — permanently delete one trashed note/template.
- `POST /trash/folders/:folderId/restore` — restore one folder batch.
- `DELETE /trash/folders/:folderId` — permanently delete one folder batch.

All mutation routes must:

- Require the authenticated owner.
- Return 404 for missing, inaccessible, or wrong-state items.
- Use shared domain functions rather than route-local delete statements.
- Return enough restored location data for deterministic navigation and cache invalidation.

## Phase 1 — Data model and active-content policy

### Files to create

- `drizzle/0024_*.sql` — generated Trash metadata migration and indexes.
- `src/api/trash/policy.ts` — shared active-row predicates/helpers.
- `tests/trash-policy.test.ts` — focused policy and migration-level behavior.

### Files to modify

- `src/api/db/schema.ts`
- `drizzle/meta/_journal.json` and generated snapshot metadata
- `src/api/harness/commands.ts`
- `src/api/lib/folder-access.ts`
- `src/api/routes/notes.ts`
- `src/api/routes/folders.ts`
- `src/api/routes/harness.ts`
- `src/api/routes/attachments.ts`
- `src/api/routes/share.ts`
- `src/api/notes/links.ts`
- `src/api/notes/tags.ts`
- `src/api/notes/versions.ts`
- `src/api/shared/wikilink-resolver.ts`

### Checklist

- [x] Add nullable Trash columns and indexes without changing existing rows.
- [x] Define shared active note/folder predicates.
- [x] Exclude trashed rows from normal reads, lists, search, line search, templates, recents, tags, links, versions, events, attachments, and folder access.
- [x] Ensure notes in trashed/inactive folders cannot be read through direct IDs.
- [x] Exclude trashed content from public note/folder shares and shared wikilink resolution.
- [x] Keep harness, MCP, OAuth, and API-key behavior read-safe without exposing Trash operations.
- [x] Add regression tests for direct access and every major query category.

### Verification

- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck`
- Targeted tests: harness, folder access, links, tags, versions, shares, shared wikilinks, attachments, and Trash policy.
- `pnpm db:generate` output review; do not apply production migrations.

### Human gate

- Review the migration and active-content query audit before adding mutation behavior.

## Phase 2 — Note and template Trash lifecycle

### Files to create

- `src/api/trash/operations.ts` — owner-scoped trash, restore, and purge operations.
- `src/api/routes/trash.ts` — authenticated Trash listing and lifecycle routes.
- `tests/trash-notes.test.ts`

### Files to modify

- `src/api/index.ts` — mount Trash routes.
- `src/api/routes/notes.ts` — replace hard delete with move-to-Trash.
- `src/api/db/schema.ts` only if event typing is extended.
- `src/frontend/lib/api.ts`
- `src/frontend/components/note-actions-popover.tsx`
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/components/notes-table.tsx`
- `src/frontend/routes/folders.$folderId.tsx`
- `src/frontend/routes/templates.tsx`
- `src/frontend/components/delete-confirm-dialog.tsx` or a new shared confirmation primitive.

### Checklist

- [x] Move active note/template rows to Trash instead of deleting them.
- [x] Revoke active note share links in the same domain operation.
- [x] Preserve versions, events, tags, links, assignments, and attachments.
- [x] Restore to the original active folder; require a valid owner-selected destination when it is unavailable.
- [x] Permanently purge only trashed notes/templates.
- [x] Delete attachment objects before removing attachment/database rows.
- [x] Return 404 for wrong-state and cross-user operations.
- [x] Update labels, pending states, mutation errors, cache invalidation, and post-action navigation.
- [x] Evaluate a short Undo opportunity; defer it because there is no notification framework and the dedicated Trash UI will provide reliable restoration.

### Verification

- Unit/integration tests for trash, repeat trash, restore, fallback restore, purge, share revocation, link visibility, version preservation, and attachment cleanup.
- Browser coverage for move-to-Trash from editor, folder table, Recent Notes, and Templates.
- Existing note editor autosave/navigation-blocking tests remain green.

### Human gate

- Review note/template behavior before enabling folder subtree operations.

## Phase 3 — Folder subtree Trash lifecycle

### Files to modify

- `src/api/trash/operations.ts`
- `src/api/routes/trash.ts`
- `src/api/routes/folders.ts`
- `src/api/lib/folder-access.ts`
- `src/frontend/lib/api.ts`
- `src/frontend/components/folder-actions-popover.tsx`
- `src/frontend/routes/folders.$folderId.settings.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `tests/folders.test.ts`
- `tests/harness-folder-access.test.ts`
- `tests/folder-share-links.test.ts`
- `tests/trash-folders.test.ts`

### Checklist

- [x] Compute an owner-scoped active descendant tree with cycle protection.
- [x] Trash the selected folder, active descendants, and active notes as one batch.
- [x] Remove the current “delete children first” restriction for move-to-Trash.
- [x] Revoke active folder and note shares affected by the subtree.
- [x] Restore the batch with original hierarchy intact.
- [x] Restore the root at top level when its original parent is missing or trashed.
- [x] Preserve independently trashed descendants as separate Trash entries.
- [x] Detach separate trashed descendants safely before permanent parent-batch purge.
- [x] Delete attachment objects for every note being permanently purged.
- [x] Keep private/read-only/API-key inheritance boundaries unchanged for active folders.
- [x] Invalidate folder, recent-note, template, navigation, and active-note caches.

### Verification

- Tests for nested trees, mixed active/trashed descendants, restore fallback, share revocation, unauthorized access, attachment cleanup, and permanent purge.
- Browser coverage for nested folder trash, disappearance from sidebar, restore, and purge.

### Human gate

- Review subtree and edge-case behavior before exposing permanent deletion broadly.

## Phase 4 — Trash interface and permanent deletion

### Files to create

- `src/frontend/routes/trash.tsx`
- `src/frontend/components/trash-table.tsx` or focused note/folder Trash list components.
- `tests/browser/trash.spec.ts`

### Files to modify

- `src/frontend/router.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/lib/navigation.ts`
- `tests/frontend-navigation.test.ts`
- `src/frontend/components/delete-confirm-dialog.tsx`
- `src/frontend/styles.css` only if existing tokens/utilities are insufficient.

### Checklist

- [x] Add a Trash destination near Templates/settings without mixing trashed folders into the active folder tree.
- [x] Show notes/templates and folder trash roots with original location and deletion time.
- [x] Provide Restore and Permanently delete actions.
- [x] Require typing `delete` only for permanent deletion.
- [x] Show pending states and actionable errors without closing dialogs prematurely.
- [x] Navigate predictably after restore.
- [x] Add accessible empty, loading, and error states.
- [x] Add responsive desktop/mobile behavior and keyboard/focus coverage.
- [x] Do not advertise automatic retention until a scheduled purge exists.

### Verification

- Browser tests for note, template, nested folder, restore fallback, permanent deletion, direct-route 404, mobile Trash access, keyboard focus, and public-share invalidation.
- Confirm unknown and stale Trash IDs fail safely.

## Phase 5 — Documentation, cleanup, and release readiness

### Files to create

- `docs/implementation/trash-and-recovery.md`

### Files to modify

- `docs/implementation/README.md`
- User-facing resource documentation if Trash behavior needs inclusion.
- `plan.md` phase status ledger during implementation.

### Checklist

- [x] Document lifecycle, security behavior, restore fallback, link behavior, share revocation, and attachment purge.
- [x] Document that agent/harness Trash operations remain out of scope.
- [x] Review all remaining direct `db.delete(notes)` and `db.delete(folders)` calls.
- [x] Review all note/folder selects for active-content predicates.
- [x] Confirm no generated test artifacts remain.
- [x] Add the completed feature to `MinuNotes — Unreleased` after implementation approval.

### Final verification

- `pnpm exec biome check --write <all changed files>`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:browser`
- `pnpm build`
- `git diff --check`
- Review generated migration SQL and metadata.
- Run local migration against a populated development fixture and verify existing rows remain active.
- Do not deploy, migrate production, commit, tag, or release without explicit approval.

## Expected file inventory

### New

- Generated `drizzle/0024_*.sql` and metadata snapshot
- `src/api/trash/policy.ts`
- `src/api/trash/operations.ts`
- `src/api/routes/trash.ts`
- `src/frontend/routes/trash.tsx`
- Focused Trash UI components as needed
- `tests/trash-policy.test.ts`
- `tests/trash-notes.test.ts`
- `tests/trash-folders.test.ts`
- `tests/browser/trash.spec.ts`
- `docs/implementation/trash-and-recovery.md`

### Existing areas expected to change

- Database schema and generated migration metadata
- API route mounting and note/folder/trash/share/attachment routes
- Harness commands, folder access, tags, versions, links, and shared wikilink resolution
- Frontend API types, router, navigation model/sidebar, action menus, tables, editor and folder routes
- Relevant unit/integration/browser tests and implementation documentation index

## Explicitly out of scope

- Agent/API-key/MCP delete or restore tools.
- Trash sharing or public recovery links.
- Collaborative deletion approval.
- Scheduled automatic purge and retention workers.
- Account deletion changes.
- Export/backup implementation.
- Generic undo/notification framework.
- Changes to Markdown, canvas, or MinuEditor document formats.

## Approval and phase status

- [x] Existing delete-flow audit completed.
- [x] Product defaults proposed and approved.
- [x] Detailed implementation plan approved.
- [x] Phase 1 started.
- [x] Phase 1 reviewed.
- [x] Phase 2 started.
- [x] Phase 2 reviewed.
- [x] Phase 3 started.
- [x] Phase 3 reviewed.
- [x] Phase 4 started.
- [x] Phase 4 reviewed.
- [x] Phase 5 completed and release-ready.

## Phase status ledger

- Phase 1 — Complete.
  - Added recoverable-delete metadata and indexes through migration `0024_soft_starbolt`.
  - Added shared hierarchy-aware active-content predicates and applied them across application, integration, sharing, metadata, links, tags, versions, and attachment reads.
  - Trashed link targets remain stored but serialize as unresolved; trashed link sources do not count toward backlinks or orphan status.
  - Added migration and cross-surface regression coverage in `tests/trash-policy.test.ts` and advanced migration fixtures through `0024`.
  - Verification: Biome completed on changed TypeScript files with existing warnings only; typecheck passed; 189/189 unit/integration tests passed; production build passed with the existing large-chunk advisory; `git diff --check` passed.
  - Human gate: Phase 1 was accepted when Phase 2 was started.
- Phase 2 — Complete.
  - Replaced note/template hard deletion with owner-scoped move-to-Trash operations and immediate share revocation.
  - Added authenticated Trash listing, restore, and permanent-delete endpoints without exposing lifecycle mutations to harness, MCP, OAuth, or API keys.
  - Preserved versions, events, tags, links, assignments, and attachments while recoverable; recorded Trash and restore activity events.
  - Added claimed permanent purge with explicit attachment-object deletion and unused-tag cleanup.
  - Updated note actions to use simple `Move to Trash` confirmation, async pending/error handling, cache invalidation, and deterministic post-delete navigation.
  - Added backend lifecycle coverage in `tests/trash-notes.test.ts` and browser coverage for editor, folder, Recent Notes, Templates, and mutation failures in `tests/browser/note-trash.spec.ts`.
  - Verification: Biome completed on changed files with existing warnings only; typecheck passed; 194/194 unit/integration tests passed; 38/38 targeted browser tests passed; production build passed with the existing large-chunk advisory; `git diff --check` passed.
  - Decision: short Undo was deferred until the dedicated Trash interface rather than introducing a generic notification framework.
  - Human gate: Phase 2 was accepted when Phase 3 was started.
- Phase 3 — Complete.
  - Replaced folder hard deletion with owner-scoped subtree batching across active descendants and notes; folders no longer need children removed first.
  - Added folder Trash summaries, subtree restore, top-level fallback restore, and permanent folder-batch purge endpoints.
  - Revoked affected note and folder shares while preserving recoverable versions, events, tags, links, assignments, permissions, and attachments.
  - Preserved separately trashed child subtrees during parent purge, including inherited private and agent-read-only boundaries after detachment.
  - Blocked parent purge while standalone trashed notes still reference the subtree, preventing foreign-key cascades from destroying recoverable notes.
  - Rehomed attachment metadata and version snapshots belonging to notes moved outside a purged subtree so unrelated active content remains intact.
  - Added attachment purge claims with rollback on storage failure, broad frontend cache invalidation, and simple `Move to Trash` folder confirmations.
  - Added six folder lifecycle integration tests in `tests/trash-folders.test.ts`, updated folder behavior coverage, and added nested subtree browser coverage in `tests/browser/folder-trash.spec.ts`.
  - Verification: Biome completed on changed files with existing warnings only; typecheck passed; 200/200 unit/integration tests passed; 28/28 navigation and Trash browser tests passed, including 5/5 final focused Trash tests; production build passed with the existing large-chunk advisory; `git diff --check` passed.
  - Sequencing note: browser restore and permanent-purge flows remain for Phase 4 because those controls belong to the dedicated Trash interface; Phase 3 covers them through integration tests.
  - Human gate: Phase 3 was accepted when Phase 4 was started.
- Phase 4 — Complete.
  - Added the authenticated `/trash` route, route-aware breadcrumbs/title, and desktop/mobile sidebar destination without mixing deleted folders into the active tree.
  - Added responsive folder-root and note/template lists with item type, original-location availability, deletion time, and subtree counts.
  - Added deterministic restore navigation, including active-folder destination selection for notes/templates whose original folder is unavailable and top-level folder fallback.
  - Added typed `delete` confirmation only for permanent deletion, pending labels, in-dialog mutation errors, stale-ID safety, and attachment/subtree warnings.
  - Rebuilt the shared confirmation dialog on Radix Dialog for focus trapping, Escape behavior, trigger focus restoration, and pending-state dismissal protection; updated revocation triggers to preserve valid interactive markup and async errors.
  - Added accessible loading, retryable error, empty, and no-destination states; no automatic-retention promise is shown.
  - Added `tests/browser/trash.spec.ts` with eight browser cases covering note/template/folder restore, fallback, destination selection, note and nested-folder purge, direct-route/public-share denial, mobile access, keyboard focus, stale mutations, empty state, and load failure.
  - Verification: Biome completed on Phase 4 files with existing class-order warnings only; typecheck passed; 200/200 unit/integration tests passed; final focused Trash browser run passed 13/13 and navigation run passed 23/23; production build passed with the existing large-chunk advisory; `git diff --check` passed.
  - Human gate: Phase 4 was accepted when Phase 5 was started.
- Phase 5 — Complete and release-ready.
  - Added `docs/implementation/trash-and-recovery.md` and indexed the lifecycle, restore fallback, security, share revocation, attachment purge, migration, and internal endpoint behavior.
  - Audited all direct note/folder deletes; only permanent purge operations in `src/api/trash/operations.ts` hard-delete notes or folders.
  - Audited note/folder selects across routes, harness commands, metadata, links, versions, sharing, and Trash operations; active surfaces use shared active-content predicates while raw deleted-row access remains isolated to Trash lifecycle operations.
  - Documented the active-content and owner-only Trash boundary in project/global harness skills, direct API guidance, in-app resources, OpenAPI descriptions, the MCP package, and agent integration guidance.
  - Kept Trash listing, restore, and purge absent from harness, OpenAPI, hosted MCP, local MCP, OAuth tools, and API-key tools; added tests that enforce the absence and confirm trashed-content read/write denial.
  - Removed generated Playwright result artifacts and confirmed migration `0024_soft_starbolt.sql` remains the only schema delta; populated-fixture migration coverage confirms existing rows remain active.
  - Verification: Biome completed across 57 changed code files with existing class-order warnings only; root and MCP typechecks passed; 200/200 unit/integration tests passed; full browser suite passed 55/55; root and MCP builds passed with the existing web large-chunk advisory; `pnpm db:generate` reported no schema changes; `git diff --check` passed.
  - Human gate: implementation approval was recorded when the user requested committing all completed work; `MinuNotes — Unreleased` was updated in note `note_26227aa114ee4ef4bfd9d782c7d528f4`.
