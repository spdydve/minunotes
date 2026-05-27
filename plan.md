# Notes MVP Implementation Plan

## Agent Harness Direction

### Current Decision
Keep the harness intentionally small. The app remains a normal notes app with MinuEditor and autosave. The harness is only a thin internal seam around document reads/writes plus read-only markdown structure helpers.

### MVP Principles
- `notes.content` remains the canonical markdown document.
- The app's existing note APIs remain app-native and optimized for UI/autosave.
- Harness logic starts as internal backend functions, not a separate product surface.
- Public agent/harness mutation APIs are deferred until permissions, snapshots, and conflict behavior are clearer.
- No document versions for now.
- No operation history for now.
- No suggestions/review workflow for now.
- No snapshots until direct agent mutation is actually introduced.
- Sections are derived from markdown on demand; they are not persisted.

### Completed Slice 1 — Internal Document Command Seam
Goal: create one shared backend path for note/document reads and updates without changing product behavior.

Files changed:
- `src/api/harness/hash.ts`
- `src/api/harness/commands.ts`
- `src/api/routes/notes.ts`
- `src/frontend/lib/api.ts`

Completed:
- [x] Add `hashMarkdown()` helper.
- [x] Add `readDocument()` command.
- [x] Add `updateDocument()` command.
- [x] Route `GET /notes/:noteId` through `readDocument()`.
- [x] Route `PATCH /notes/:noteId` through `updateDocument()`.
- [x] Return `contentHash` from note read/update responses.
- [x] Keep current autosave behavior unchanged.
- [x] Avoid DB/schema changes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

Commit:
- `b8dadff Add minimal document harness commands`

### Completed Slice 2 — Read-Only Section Awareness
Goal: let future agents inspect markdown structure without enabling new mutation paths.

Files changed:
- `src/api/harness/sections.ts`
- `src/api/routes/notes.ts`
- `src/frontend/lib/api.ts`

Completed:
- [x] Add `DocumentSection` type.
- [x] Parse ATX markdown headings (`#` through `######`).
- [x] Generate slug-style section IDs with duplicate suffixes.
- [x] Compute heading/content ranges.
- [x] Add `GET /notes/:noteId/outline`.
- [x] Add `GET /notes/:noteId/sections/:sectionId`.
- [x] Include `contentHash` in outline/section responses.
- [x] Add frontend API types/helpers.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

Commit:
- `998eaf5 Add read-only document section endpoints`

### Completed Slice 3 — Agent Discovery Commands
Goal: let agents find candidate notes using existing folder/note data without adding new persistence, semantic/vector search, or mutation behavior.

Files to modify:
- `src/api/harness/commands.ts` — add folder/document discovery commands.
- `src/api/routes/folders.ts` — optionally reuse `listFolders()` command.
- `src/api/routes/notes.ts` — optionally reuse `searchDocuments()` command.
- `src/frontend/lib/api.ts` — no changes expected unless response shapes change.
- `tests/harness.test.ts` — keep pure helper coverage; DB-backed command tests are deferred.

Checklist:
- [x] Add `listFolders()` harness command.
- [x] Add `listDocuments()` harness command with optional `folderId`.
- [x] Add `searchDocuments()` harness command using title/content matching.
- [x] Preserve existing folder/note API response shapes.
- [x] Keep discovery read-only.
- [x] Avoid DB/schema changes.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

Commit:
- `9b184b4 Add harness discovery commands and tests`

### Completed Slice 4 — Stale Document Detection
Goal: detect when a note open in the editor has changed elsewhere, without WebSockets/SSE or realtime collaboration.

Files changed:
- `src/api/routes/notes.ts`
- `src/frontend/lib/api.ts`
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/components/note-editor.tsx`

Completed:
- [x] Add `GET /notes/:noteId/status`.
- [x] Add `api.noteStatus(noteId)` client helper.
- [x] Track last known `contentHash` in the note editor route.
- [x] Update last known hash after successful save.
- [x] Send `baseHash` with note save requests.
- [x] Poll status while note is open and tab is visible.
- [x] Detect external hash mismatch.
- [x] Show stale document banner.
- [x] Prevent autosave while stale.
- [x] Add reload action.
- [x] Avoid WebSockets/SSE for MVP.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Patch-Style Document Edits
Goal: support terminal-like markdown edits for agents without adding versions, snapshots, suggestions, or section-specific mutation APIs.

Files to modify/create:
- `src/api/harness/edits.ts` — pure edit validation/application helpers.
- `src/api/harness/commands.ts` — add `editDocument()` command.
- `src/api/routes/notes.ts` — add note-native edit endpoint.
- `src/frontend/lib/api.ts` — add API helper/types.
- `tests/harness.test.ts` — add pure edit tests.

Edit primitives:
- `append` — append markdown to the end of the document.
- `replace_text` — replace exact text that must match exactly once.
- `replace_range` — replace a valid character range.

Safety rules:
- `baseHash` supported for conflict detection.
- all edits validate before application.
- multiple range edits must not overlap.
- failed validation applies no edits.

Checklist:
- [x] Add `DocumentEdit` types.
- [x] Add `applyDocumentEdits()` helper.
- [x] Validate `replace_text` matches exactly once.
- [x] Validate `replace_range` bounds.
- [x] Validate range edits do not overlap.
- [x] Apply multiple edits deterministically.
- [x] Add `editDocument()` harness command.
- [x] Add `POST /notes/:noteId/edit` endpoint.
- [x] Add frontend API helper.
- [x] Add tests for edit helper.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Create Document Command
Goal: let app and future agents create markdown documents through the shared harness command path.

Files to modify:
- `src/api/harness/commands.ts` — add `createDocument()`.
- `src/api/routes/folders.ts` — route note creation through `createDocument()`.
- `src/frontend/lib/api.ts` — allow optional title/content when creating notes.
- `plan.md` — track completion.

Checklist:
- [x] Add `createDocument()` harness command.
- [x] Validate target folder belongs to user.
- [x] Support optional title and markdown.
- [x] Preserve existing app create-note behavior.
- [x] Route `POST /folders/:folderId/notes` through `createDocument()`.
- [x] Avoid DB/schema changes.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Agent Editable Document Guard
Goal: add a simple per-document flag that lets users keep normal app editing while preventing agent/API edits to sensitive notes.

Decision:
- Use `is_api_editable` instead of a full lock.
- User/app edits are still allowed.
- API edits are rejected when `is_api_editable = false`.
- Folder/API-key permissions can layer on top later.

Files to modify/create:
- `src/api/db/schema.ts` — add `notes.isApiEditable`.
- `drizzle/*` — add migration.
- `src/api/harness/commands.ts` — enforce flag for `actorType: "agent"` mutations.
- `src/api/routes/notes.ts` — allow user/app to update the flag.
- `src/frontend/lib/api.ts` — expose field/type in `Note`.
- `src/frontend/components/note-actions-popover.tsx` — add note action to toggle agent editability.
- `src/frontend/routes/notes.$noteId.tsx` — wire toggle mutation.
- `plan.md` — track implementation.

Checklist:
- [x] Add `is_api_editable` column defaulting to true.
- [x] Regenerate/add Drizzle migration.
- [x] Include `isApiEditable` in frontend `Note` type.
- [x] Allow `PATCH /notes/:noteId` to update `isApiEditable`.
- [x] Reject agent content/title/move edits when `isApiEditable` is false.
- [x] Keep normal app/user edits working regardless of this flag.
- [x] Add note action to enable/disable API edits.
- [x] Avoid adding folder permissions/API keys in this slice.

Verification:
- [x] `pnpm db:generate` or migration creation succeeds.
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Session Harness API v0
Goal: expose a stable harness route surface for external helpers while still using the existing Better Auth user session. API keys and folder permissions remain deferred.

Files to create/modify:
- `src/api/routes/harness.ts` — session-authenticated harness endpoints.
- `src/api/index.ts` — mount `/api/harness` with auth middleware.
- `plan.md` — track completion.

Endpoints:
- `GET /api/harness/folders`
- `GET /api/harness/notes/search?q=`
- `GET /api/harness/notes/:noteId`
- `GET /api/harness/notes/:noteId/outline`
- `GET /api/harness/notes/:noteId/sections/:sectionId`
- `POST /api/harness/notes`
- `POST /api/harness/notes/:noteId/edit`

Checklist:
- [x] Add harness routes file.
- [x] Reuse existing harness commands.
- [x] Keep routes session-authenticated.
- [x] Create notes with folder/title/content payload.
- [x] Edit notes with patch-style edits and optional `baseHash`.
- [x] Return content hashes from read/create/edit endpoints.
- [x] Avoid adding API keys/permissions in this slice.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — API Access v0
Goal: allow external agents to authenticate to `/api/harness/*` without browser cookies while still scoping access to the owning user.

Scope:
- Add DB-backed API keys.
- Store only key hashes.
- Show raw key only at creation time.
- Allow bearer key auth for harness routes.
- Keep API key permissions broad for now: key can access the owner's harness resources.
- Still respect `is_api_editable` for agent mutations.
- Folder-level permissions are deferred.

Files to modify/create:
- `src/api/db/schema.ts` — add `api_keys` table.
- `drizzle/*` — add migration.
- `src/api/lib/api-keys.ts` — key generation/hash helpers.
- `src/api/middleware/authentication.ts` — add agent key auth helper/middleware.
- `src/api/routes/api-keys.ts` — create/list/revoke keys with session auth.
- `src/api/routes/harness.ts` — set actor metadata based on auth source.
- `src/api/index.ts` — mount key routes and bearer-capable harness auth.
- `plan.md` — track completion.

Checklist:
- [x] Add `api_keys` schema.
- [x] Generate migration.
- [x] Add API key generation/hash helpers.
- [x] Add session-only agent key management routes.
- [x] Add bearer API key auth for harness routes.
- [x] Scope bearer auth to the API key owner user.
- [x] Mark harness writes from bearer auth as `actorType: "agent"`.
- [x] Keep session harness writes as `actorType: "user"`.
- [x] Respect `is_api_editable` for API edits.
- [x] Defer folder permissions/UI.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — API Key Security Refactor
Goal: upgrade agent API keys to a readable UID + secret format with salted scrypt hashes and timing-safe verification.

Decisions:
- Key format: `ntak_<uid>_<secret>`.
- `uid` is an 8-character lookup identifier.
- `secret` is a longer random secret.
- Store `uid`, `hash`, and `salt`; never store raw keys.
- Verify with `scrypt` and `timingSafeEqual`.
- Support both `Authorization: Bearer <key>` and `x-api-key: <key>`.

Files to modify:
- `src/api/db/schema.ts` — replace `keyHash` with `uid`, `hash`, `salt`, and `updatedAt`.
- `drizzle/*` — add migration.
- `src/api/lib/api-keys.ts` — key parsing/generation/hash/verify helpers.
- `src/api/middleware/authentication.ts` — lookup by `uid`, verify hash.
- `src/api/routes/api-keys.ts` — return `uid`/safe metadata.
- `plan.md` — track completion.

Checklist:
- [x] Add `uid`, `hash`, `salt`, `updated_at` fields.
- [x] Generate migration.
- [x] Generate keys as `ntak_<uid>_<secret>`.
- [x] Hash full API key with scrypt + random salt.
- [x] Verify with timing-safe compare.
- [x] Lookup API key by `uid`.
- [x] Support `Authorization: Bearer`.
- [x] Support `x-api-key`.
- [x] Return raw key only once at creation.
- [x] Never return hash/salt.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — API Key Folder Permissions v0
Goal: constrain API-key harness access to explicitly allowed folders and actions, without adding workspaces yet.

Scope:
- Session users keep full access to their own data.
- API keys are limited by folder permissions.
- Permissions: `can_read`, `can_create`, `can_edit`.
- `is_api_editable` still blocks API-key edits even when `can_edit` is true.

Files to modify:
- `src/api/db/schema.ts` — add folder permission table.
- `drizzle/*` — add migration.
- `src/api/routes/api-keys.ts` — accept/list key permissions.
- `src/api/routes/harness.ts` — enforce permissions for bearer-auth harness requests.
- `plan.md` — track completion.

Checklist:
- [x] Add `api_key_folder_permissions` table.
- [x] Generate migration.
- [x] Accept permissions at API key creation.
- [x] Return permissions when listing keys.
- [x] Restrict `/api/harness/folders` for API keys.
- [x] Enforce `can_read` for read/search/outline/section.
- [x] Enforce `can_create` for note creation.
- [x] Enforce `can_edit` for patch edits.
- [x] Preserve full session-user harness behavior.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Agent Key Management UI v0
Goal: manage agent API keys from a dedicated settings page, with key creation in a focused modal.

Decision:
- Use a full content page for key listing and revocation.
- Use a modal only for key creation and one-time secret display.
- Sidebar settings menu navigates to the settings page.
- Copy button uses icon feedback.

Files modified/created:
- `src/frontend/routes/settings.api-access.tsx` — settings page.
- `src/frontend/components/create-agent-key-dialog.tsx` — create-key modal.
- `src/frontend/components/folder-sidebar.tsx` — settings menu link.
- `src/frontend/router.tsx` — route registration.
- `src/frontend/lib/api.ts` — agent key API helpers/types.

Checklist:
- [x] Add `/settings/api-access` route.
- [x] List existing keys on a page.
- [x] Revoke keys from the page.
- [x] Create keys from a modal.
- [x] Select folder permissions during creation.
- [x] Show raw key once.
- [x] Add copy icon/check feedback.
- [x] Navigate to page from sidebar settings menu.
- [x] Remove all-in-one settings popover modal.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Editable API Key Access Controls v0
Goal: allow users to update API key names and folder permissions after creation.

Scope:
- Add `PATCH /api/api-keys/:keyId`.
- Replace folder permission rows on update.
- Validate folders belong to the current user.
- Add edit modal in API Access settings page.
- Add Grant all / Clear all controls for permissions.
- Continue hiding raw key after creation.

Files to modify/create:
- `src/api/routes/api-keys.ts` — update endpoint.
- `src/frontend/lib/api.ts` — update helper.
- `src/frontend/components/api-key-access-dialog.tsx` — shared create/edit modal.
- `src/frontend/routes/settings.api-access.tsx` — edit action.
- `plan.md` — track completion.

Checklist:
- [x] Add backend patch route.
- [x] Allow name updates.
- [x] Replace permission rows when permissions are provided.
- [x] Validate folder ownership for permission rows.
- [x] Add reusable access dialog for create/edit.
- [x] Add Grant all control.
- [x] Add Clear all control.
- [x] Add edit button on settings page.
- [x] Refresh key list after save.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — Folder-Level API Access Controls v0
Goal: add the inverse API access control surface from a folder: which API keys can access this folder?

Scope:
- Add folder action menu item for API Access.
- Show all active API keys with permissions for the selected folder.
- Allow toggling Read/Create/Edit for that folder per key.
- Save by updating each affected key's permissions through existing API key update endpoint.
- Keep global API Access page as primary key management surface.

Files to modify/create:
- `src/frontend/components/folder-api-access-dialog.tsx` — folder-centric access modal.
- `src/frontend/components/folder-actions-popover.tsx` — add API Access action.
- `plan.md` — track completion.

Checklist:
- [x] Add folder API access dialog.
- [x] Load API keys in dialog.
- [x] Display permissions for selected folder per key.
- [x] Allow per-key Read/Create/Edit toggles.
- [x] Save changed permissions through `api.updateApiKey()`.
- [x] Add folder action menu entry.
- [x] Refresh API key data after save.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Next Slice — API Access Hardening v0
Goal: improve safety and visibility for API-driven note updates.

Scope:
- Add revoke confirmation for API keys.
- Add minimal note update metadata.
- Track last updater actor type/id on notes.
- Surface last updated by API in the note editor and note list.

Files to modify/create:
- `src/api/db/schema.ts` — add note update actor metadata.
- `drizzle/*` — add migration.
- `src/api/harness/commands.ts` — persist update actor metadata.
- `src/frontend/lib/api.ts` — expose metadata in `Note`.
- `src/frontend/routes/settings.api-access.tsx` — revoke confirmation.
- `src/frontend/components/notes-table.tsx` — optional updated-by display.
- `src/frontend/components/note-editor.tsx` or note route — last updated by display.
- `plan.md` — track completion.

Checklist:
- [x] Add `updated_by_actor_type` and `updated_by_actor_id` to notes.
- [x] Generate migration.
- [x] Persist update actor metadata on create/update/edit commands.
- [x] Expose metadata in frontend note type.
- [x] Add revoke confirmation flow for API keys.
- [x] Show when a note was last updated via API.
- [x] Keep normal user flows unchanged.

Verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

### Deferred Work
Do not implement these until explicitly planned:
- Direct section mutation endpoints.
- Public `/harness/*` routes.
- Agent/API-key permission model.
- Agent create/append write commands.
- Snapshots/restore.
- Event/audit log.
- Suggestions/review flow.
- Operation records/replay.
- Document version history.
- MCP adapter.

### Next Planning Question
Before adding any mutation capability for agents, decide this first:

> Should trusted agents be allowed to directly edit documents, and if so, do direct API edits require an automatic pre-edit snapshot?

Recommended answer for now:
- Keep only read-only harness capabilities merged.
- Next implementation phase should likely be agent create/append write commands, with ownership rules for agent-created documents.

---

## Auth Integration Plan — Better Auth

### Goal
Add authentication using the provided `react-hono-sst` template as a reference, then scope all folders and notes to the authenticated user. Existing local notes/folders can be reset.

### Reference Template
- `/Users/davidkennedy/Workspaces/dpklabs/templates/react-hono-sst`
- Relevant files reviewed:
  - `packages/api/src/lib/auth.ts`
  - `packages/api/src/routes/auth.ts`
  - `packages/api/src/middlewares/authentication.ts`
  - `packages/web/src/lib/auth-client.ts`
  - `packages/web/src/routes/auth.tsx`
  - `packages/core/src/db/schema/auth.ts`
  - `packages/core/src/db/migrations/0000_military_valkyrie.sql`

### MVP Auth Decisions
- Use Better Auth with email OTP, matching the template.
- Log OTP codes to the Lambda/dev console for MVP; real email delivery later.
- Require auth for all folders/notes APIs.
- Reset local notes/folders instead of backfilling existing data.
- Add `user_id` to folders and notes so data is user-scoped.
- Use same-origin `/api/auth` in the browser via existing Vite proxy.

### Files To Modify / Create
- `package.json` — add `better-auth` dependency.
- `pnpm-lock.yaml` — lockfile update.
- `src/api/db/schema.ts` — add Better Auth tables and `userId` ownership columns.
- `drizzle/*` — create/reset migrations for auth + ownership schema.
- `src/api/lib/auth.ts` — Better Auth server config.
- `src/api/routes/auth.ts` — auth handler route.
- `src/api/middleware/authentication.ts` — session/user middleware.
- `src/api/index.ts` — mount `/api/auth` and wire auth variables/middleware.
- `src/api/routes/folders.ts` — require user and scope list/create/rename/delete to user.
- `src/api/routes/notes.ts` — require user and scope get/update/move/delete/search to user.
- `src/frontend/lib/auth-client.ts` — Better Auth React client.
- `src/frontend/routes/auth.tsx` — email/OTP sign-in page.
- `src/frontend/routes/__root.tsx` or router setup — session loading/redirect handling if needed.
- `src/frontend/components/app-shell.tsx` — auth gate or logout UI.
- `src/frontend/components/folder-sidebar.tsx` — logout button/current user display if desired.
- `src/frontend/lib/api.ts` — handle 401s consistently.
- Optional: `.env.example` — document `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` if needed.

### Implementation Checklist
- [x] Install Better Auth.
- [x] Add Better Auth schema tables: `user`, `session`, `account`, `verification`.
- [x] Add `user_id` ownership columns to `folders` and `notes`.
- [x] Reset/regenerate local migration for the new schema.
- [x] Add Better Auth server config with Drizzle/LibSQL adapter.
- [x] Add `/api/auth/*` handler route.
- [x] Add auth middleware that sets `user` and `session` from request headers.
- [x] Protect folder routes and scope every query/mutation by `user.id`.
- [x] Protect note routes and scope every query/mutation by `user.id` through folder ownership.
- [x] Add frontend auth client.
- [x] Add email OTP sign-in page.
- [x] Add logout action.
- [x] Redirect unauthenticated users to auth UI.
- [x] Ensure Vite proxy and API auth paths work with cookies locally.
- [x] Reset local DB and apply migrations.

### Verification
- [x] `pnpm install` / dependency install succeeds.
- [x] `pnpm db:migrate` succeeds on reset local DB.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] Manual test: unauthenticated user sees auth page or receives 401/redirect.
- [x] Manual test: email OTP flow signs in using console OTP.
- [x] Manual test: signed-in user can create folders/notes.
- [x] Manual test: signed-in user can rename folder, move note, search notes.
- [x] Manual test: logout blocks access to notes.
- [ ] Manual test: separate users do not see each other’s folders/notes.

---

## Folder Management + Search Plan

### Goal
Add practical folder management and note search improvements after the editor integration.

### Scope
- Add folder rename support.
- Add note move support between folders.
- Add search across notes by title and content.
- Keep delete confirmation behavior unchanged.
- Keep folders sorted alphabetically after rename.
- Keep unauthenticated MVP model unchanged.

### Files To Modify / Create
- `src/api/routes/folders.ts` — add folder rename endpoint.
- `src/api/routes/notes.ts` — add note move support and search endpoint.
- `src/frontend/lib/api.ts` — add API client methods for folder rename, note move, and search.
- `src/frontend/components/folder-sidebar.tsx` — expose folder rename action/UI.
- `src/frontend/components/notes-table.tsx` — add note move action and/or search-aware display if needed.
- `src/frontend/components/note-editor.tsx` — optionally expose selected folder/move UI if note move belongs in editor.
- `src/frontend/routes/folders.$folderId.tsx` — wire folder-scoped actions and optional local folder note filter.
- `src/frontend/routes/notes.$noteId.tsx` — wire note move if implemented in editor.
- `src/frontend/routes/__root.tsx` or `src/frontend/components/app-shell.tsx` — add global search UI/route entry point.
- Optional: `src/frontend/components/search-dialog.tsx` — reusable command/search modal.
- Optional: `src/frontend/routes/search.tsx` — dedicated search results route if not using a dialog.

### Proposed API Changes
- `PATCH /folders/:folderId` — update folder title.
- `PATCH /notes/:noteId` — extend existing update to optionally accept `folderId` for moving notes.
- `GET /notes/search?q=...` — search notes by title/content, returning id, title, folder id/title, and updated date.

### Implementation Checklist
- [x] Confirm UX: global search dialog vs dedicated search results page.
- [x] Confirm UX: folder rename inline in sidebar vs modal/popover.
- [x] Confirm UX: note move from notes table, editor, or both.
- [x] Add backend validation for rename/search/move inputs.
- [x] Add folder rename endpoint and keep alphabetical ordering on refetch.
- [x] Extend note update or add move endpoint for changing `folderId`.
- [x] Add note search query with title/content matching.
- [x] Add frontend API client methods.
- [x] Add folder rename UI and mutation invalidation.
- [x] Add note move UI and mutation invalidation.
- [x] Add search UI and results navigation.
- [x] Preserve existing delete confirmations and save behavior.

### Verification
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [ ] Manual test: rename folder → sidebar updates alphabetically → reload persists.
- [ ] Manual test: move note to another folder → old folder loses note → new folder shows note.
- [ ] Manual test: search by note title returns expected note.
- [ ] Manual test: search by note content returns expected note.
- [ ] Manual test: clicking search result opens the note.
- [ ] Manual test: existing create/delete/save flows still work.

---

## Editor Integration Plan — `@dpklabs/minueditor`

Branch: `editor-integration`

### Goal
Replace the plain textarea note body with `@dpklabs/minueditor` while keeping the existing MVP save behavior.

### Scope
- Keep note title editing unchanged.
- Replace body textarea in `src/frontend/components/note-editor.tsx` with MinuEditor.
- Continue storing editor output in the existing `notes.content` text column.
- Continue explicit save via save button and `Ctrl/Cmd+S`.
- Do not add autosave yet.
- Preserve delete note confirmation behavior.

### Files To Modify
- `package.json` — add `@dpklabs/minueditor` dependency.
- `pnpm-lock.yaml` — dependency lockfile update.
- `src/frontend/components/note-editor.tsx` — swap textarea for MinuEditor.
- `src/frontend/routes/notes.$noteId.tsx` — adjust content state handlers if MinuEditor uses a different value/change API.
- `src/frontend/styles.css` — add any editor-specific styling/imports if required.

### Implementation Checklist
- [x] Inspect `@dpklabs/minueditor` exports and usage API from installed package.
- [x] Determine whether editor value is plain text, Markdown, HTML, or structured JSON.
- [x] Confirm the existing `notes.content` text column can store the editor value without migration.
- [x] Replace textarea with MinuEditor in the reusable `NoteEditor` component.
- [x] Wire editor changes into existing `content` state.
- [x] Confirm save button persists editor content.
- [x] Confirm `Ctrl/Cmd+S` persists editor content.
- [x] Add minimal styling so the editor fits the existing flat dashboard design.
- [x] Keep an empty-state/placeholder experience for new untitled notes.

### Verification
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] Manual test: existing Markdown headings render before clicking into the editor.
- [x] Manual test: editor enters edit mode when clicked.
- [x] Manual test: create note → type editor content → save → leave note → reopen note → content persists.
- [x] Manual test: `Ctrl/Cmd+S` saves editor content.
- [x] Manual test: delete note flow still works.

---


## Scope
Build a simple unauthenticated note-taking MVP with folders and notes.

- Folders are shown in a sidebar.
- Creating a folder opens a modal and captures a title before creation.
- Selecting a folder shows that folder's notes in a main-content table.
- Creating a note opens/loads an editor page with an untitled note.
- Users can retitle notes inside the editor.
- Authentication is deferred; schema can leave room for future Better-Auth ownership fields.
- Note content is plain text for MVP.
- Notes use explicit saving via save button and `Ctrl/Cmd+S`; autosave is deferred.
- Folders and notes can be deleted after a confirmation modal requiring the user to type `delete`.
- Folders are ordered alphabetically.
- LibSQL starts as a local development database; hosted Turso is a fast-follow.

## Proposed Architecture

### Infrastructure
- SST deploys:
  - Hono API as an AWS Lambda.
  - Vite React frontend as a static site.
  - Environment bindings for LibSQL/Turso connection details.

### Backend
- Hono application exposes REST endpoints for folders and notes.
- Drizzle ORM with LibSQL driver.
- Drizzle migrations define `folders` and `notes` tables.
- No auth middleware for MVP.

### Frontend
- Vite + React + TanStack Router.
- TanStack Query for API data fetching/mutations.
- TanStack Table for notes table.
- TanStack Form for folder creation and note title editing.
- Shadcn + Tailwind for reusable UI primitives.
- Dashboard shell: sidebar folders + main content.
- Mono/technical typography, flat backgrounds, light status/type color.

## Data Model

### `folders`
- `id` text primary key
- `title` text not null
- `created_at` integer/date not null
- `updated_at` integer/date not null

### `notes`
- `id` text primary key
- `folder_id` text not null references `folders.id`
- `title` text not null default `Untitled note`
- `content` text not null default empty string
- `created_at` integer/date not null
- `updated_at` integer/date not null

## API Endpoints

### Folders
- `GET /folders` — list folders
- `POST /folders` — create folder with title
- `GET /folders/:folderId/notes` — list notes in folder
- `DELETE /folders/:folderId` — delete folder and all child notes after confirmation in UI

### Notes
- `POST /folders/:folderId/notes` — create untitled note in folder
- `GET /notes/:noteId` — get note editor payload
- `PATCH /notes/:noteId` — update title/content
- `DELETE /notes/:noteId` — delete note after confirmation in UI

## Routes / Screens

- `/` — redirect to first folder or dashboard empty state
- `/folders/:folderId` — folder notes table
- `/notes/:noteId` — note editor

## Files To Create / Modify

### Root / Tooling
- Modify `package.json` — scripts and dependencies.
- Modify `tsconfig.json` — shared TypeScript config.
- Modify `sst.config.ts` — API/frontend resources and env wiring.
- Create `.env.example` — required local env vars.
- Create `drizzle.config.ts` — migration config.

### Backend
- Create `src/api/index.ts` — Hono Lambda entry.
- Create `src/api/routes/folders.ts` — folder endpoints.
- Create `src/api/routes/notes.ts` — note endpoints.
- Create `src/api/db/client.ts` — LibSQL/Drizzle client.
- Create `src/api/db/schema.ts` — Drizzle schema.
- Create `src/api/db/migrations/*` — generated migrations.
- Create `src/api/lib/id.ts` — id helper if needed.

### Frontend
- Create `index.html`.
- Create `vite.config.ts`.
- Create `src/frontend/main.tsx`.
- Create `src/frontend/router.tsx`.
- Create `src/frontend/routes/__root.tsx`.
- Create `src/frontend/routes/index.tsx`.
- Create `src/frontend/routes/folders.$folderId.tsx`.
- Create `src/frontend/routes/notes.$noteId.tsx`.
- Create `src/frontend/components/app-shell.tsx`.
- Create `src/frontend/components/folder-sidebar.tsx`.
- Create `src/frontend/components/create-folder-dialog.tsx`.
- Create `src/frontend/components/notes-table.tsx`.
- Create `src/frontend/components/note-editor.tsx`.
- Create `src/frontend/lib/api.ts`.
- Create `src/frontend/lib/query.tsx`.
- Create `src/frontend/styles.css`.
- Create shadcn component files as needed under `src/frontend/components/ui/*`.

## Implementation Checklist

### Phase 1 — Project Setup
- [x] Add frontend, backend, ORM, and tooling dependencies.
- [x] Add Vite, Tailwind, and shadcn-compatible config.
- [x] Add Drizzle config and environment example.
- [x] Update SST config for API and frontend.

Verification:
- [x] `pnpm install` succeeds.
- [x] TypeScript config resolves frontend/backend imports.
- [x] SST dev starts API Gateway/Lambda and Vite.

### Phase 2 — Database
- [x] Define `folders` schema.
- [x] Define `notes` schema.
- [x] Generate initial migration.

Verification:
- [x] Migration applies to local LibSQL database.
- [x] Drizzle schema type-checks.

### Phase 3 — Backend API
- [x] Implement Hono app and Lambda adapter.
- [x] Implement folder routes.
- [x] Implement note routes.
- [x] Add basic request validation.
- [x] Add consistent JSON error responses.

Verification:
- [x] API can create/list folders.
- [x] API can create/list/update notes.
- [x] Invalid inputs return 400-level responses.

### Phase 4 — Frontend Shell
- [x] Implement app shell with sidebar dashboard layout.
- [x] Implement folder sidebar query.
- [x] Implement create-folder modal with TanStack Form.
- [x] Implement empty states.

Verification:
- [x] Dashboard loads with no authentication.
- [x] Folder creation updates sidebar.
- [x] Layout works in light/dark themes.

### Phase 5 — Notes Views
- [x] Implement folder notes table with TanStack Table.
- [x] Implement create-note action that navigates to editor.
- [x] Implement note editor route.
- [x] Implement note title editing.
- [x] Implement note content editing with explicit save button.
- [x] Implement `Ctrl/Cmd+S` keyboard shortcut for saving notes.
- [x] Implement delete note confirmation dialog requiring `delete`.

Verification:
- [x] Clicking a folder shows its notes.
- [x] Creating a note opens an untitled note editor.
- [x] Retitling a note persists and updates table/sidebar state.
- [x] Saving with the button persists note title/content.
- [x] Saving with `Ctrl/Cmd+S` persists note title/content.
- [x] Deleting a note requires typing `delete` and removes the note.

### Phase 6 — Polish
- [x] Apply simple flat shadcn/Tailwind styling.
- [x] Add loading, error, and empty states.
- [x] Add delete folder confirmation dialog requiring `delete` and warning all folder notes will be lost.
- [x] Add minimal responsive behavior.

Verification:
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] Manual MVP flow passes: create folder → create note → rename/save note → delete note → delete folder.

## Confirmed MVP Decisions

1. Note content is plain text only for MVP; richer editor support is deferred.
2. Saving uses an explicit save button plus `Ctrl/Cmd+S`; autosave is deferred.
3. Folder and note deletion are included in MVP with a destructive confirmation modal requiring the user to type `delete`.
4. Folders are sorted alphabetically.
5. LibSQL uses a local development database first; hosted Turso is a fast-follow.

## Next Steps

### Auth Follow-up
- [ ] Add production auth env config: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, cookie/domain settings.
- [ ] Replace console OTP logging with real email delivery. (deferred)
- [ ] Add auth UX polish: resend code, change email, clearer loading/error states.
- [ ] Verify deployed session persistence, cookie behavior, and logout flow.
- [ ] Add nicer full-page 404/empty states for inaccessible or missing resources.
- [ ] Prepare merge/release notes for auth integration.

### Next Implementation — Auth UX Polish

Files to modify:
- `src/frontend/routes/auth.tsx`
- `plan.md`

Checklist:
- [x] Add resend code action on the OTP step.
- [x] Add change email action from the OTP step.
- [x] Add clearer success/loading/error feedback during send/verify flows.
- [x] Keep single-OTP sign-in behavior unchanged.

Verification:
- [x] Manual test: send code transitions to OTP step.
- [x] Manual test: resend code works and shows updated feedback.
- [x] Manual test: change email returns to email entry step.
- [x] Manual test: invalid OTP shows a clear error.
- [x] Manual test: valid OTP still redirects into the app.

### Next Implementation — Deploy/Auth Hardening + Resource States

Files to modify:
- `plan.md`
- `.env.example`
- `sst.config.ts`
- `src/api/lib/auth.ts`
- `src/frontend/routes/folders.$folderId.tsx`
- `src/frontend/routes/notes.$noteId.tsx`

Checklist:
- [x] Add/document production auth env config: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `COOKIE_DOMAIN`, `FRONTEND_URL`.
- [x] Update auth server config to use deploy-safe cookie/domain settings.
- [x] Keep localhost behavior working unchanged.
- [x] Upgrade folder missing state to a fuller page state.
- [x] Upgrade note missing state to a fuller page state.

Verification:
- [x] `pnpm typecheck` passes.
- [x] Manual test: localhost auth flow still works.
- [x] Manual test: missing/inaccessible note shows full-page state.
- [x] Manual test: missing/inaccessible folder shows full-page state.
- [ ] Manual test: deployed session survives refresh and logout clears session.

### Next Implementation — Editor Width + Sidebar Auth Footer

Files to modify:
- `plan.md`
- `src/frontend/components/note-editor.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/ui/popover.tsx` or existing popover usage
- `src/frontend/components/app-shell.tsx` if layout adjustment is needed
- `src/frontend/components/folder-actions-popover.tsx`
- `src/frontend/styles.css`

Checklist:
- [x] Make the note editor use more of the available content width.
- [x] Add the signed-in user email to the bottom of the sidebar.
- [x] Add a cog icon button in the sidebar footer.
- [x] Open a small popup menu from the cog button.
- [x] Move logout action into the popup menu.
- [x] Keep dark mode styling consistent.
- [x] Replace gear/ellipsis text buttons with Lucide icons.
- [x] Remove borders from sidebar/footer icon buttons.
- [x] Remove left/right editor content padding.

Verification:
- [x] Manual test: note editor appears closer to full width in the content area.
- [x] Manual test: user email is visible in the sidebar footer.
- [x] Manual test: clicking the cog opens the popup.
- [x] Manual test: logout works from the popup.
- [x] Manual test: layout remains usable in light/dark themes.

### Next Implementation — Autosave + Dirty Flows

Files to modify:
- `plan.md`
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/components/note-editor.tsx`
- `src/frontend/lib/api.ts` if save handling changes
- optionally `src/frontend/components/app-shell.tsx` if route-leave UX needs shared handling

Checklist:
- [x] Add autosave for note title/content changes.
- [x] Debounce autosave to avoid saving on every keystroke.
- [x] Track dirty state for unsaved local edits.
- [x] Show clear save status: saved, saving, unsaved changes, save error.
- [x] Keep explicit save shortcut/button working.
- [x] Prevent stale query refetches from overwriting in-progress local edits.
- [x] Add route/browser leave warning when there are unsaved changes or a save is in flight.

Verification:
- [x] Manual test: editing a note autosaves after a short pause.
- [x] Manual test: save status updates correctly while typing/saving.
- [x] Manual test: `Ctrl/Cmd+S` still saves immediately.
- [x] Manual test: refresh/navigation warns when unsaved changes exist.
- [x] Manual test: reopening a note shows the latest saved content.

### Next Implementation — Note Actions Menu

Files to modify:
- `plan.md`
- `src/frontend/components/note-editor.tsx`
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/components/notes-table.tsx`
- `src/frontend/components/move-note-dialog.tsx`
- `src/frontend/components/delete-confirm-dialog.tsx`
- create `src/frontend/components/note-actions-popover.tsx`

Checklist:
- [x] Remove the visible Save button from the editor header.
- [x] Add an editor note actions menu for move/delete/future actions.
- [x] Add a matching note actions menu in the notes table.
- [x] Keep move note action available from both editor and table.
- [x] Keep delete confirmation flow unchanged inside the new menu.
- [x] Keep autosave and `Ctrl/Cmd+S` working.
- [x] Center move/delete modals on screen using portal rendering.
- [x] Style delete actions as destructive.

Verification:
- [x] Manual test: no Save button is shown.
- [x] Manual test: autosave still persists note changes.
- [x] Manual test: `Ctrl/Cmd+S` still saves immediately.
- [x] Manual test: editor actions menu supports move and delete.
- [x] Manual test: notes table actions menu supports move and delete.

### Next Implementation — Reusable Action Menu Styling

Files to modify:
- `plan.md`
- create `src/frontend/components/ui/action-menu.tsx`
- `src/frontend/components/folder-actions-popover.tsx`
- `src/frontend/components/note-actions-popover.tsx`
- `src/frontend/components/folder-sidebar.tsx`

Checklist:
- [ ] Add reusable action menu trigger styling.
- [ ] Add reusable action menu item styling with destructive variant.
- [ ] Refactor folder actions popover to use shared action menu styles.
- [ ] Refactor note actions popover to use shared action menu styles.
- [ ] Refactor sidebar settings popover to use shared action menu styles where appropriate.
- [ ] Keep icon button styling consistent across popovers.

Verification:
- [ ] `pnpm typecheck` passes.
- [ ] Manual test: folder actions menu matches note actions styling.
- [ ] Manual test: note actions menu still works.
- [ ] Manual test: sidebar settings menu matches shared styling.
