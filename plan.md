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

### Next Slice — Agent Discovery Commands
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

### Deferred Work
Do not implement these until explicitly planned:
- Direct section mutation endpoints.
- Public `/harness/*` routes.
- Agent/API-key permission model.
- Snapshots/restore.
- Event/audit log.
- Suggestions/review flow.
- Operation records/replay.
- Document version history.
- MCP adapter.

### Next Planning Question
Before adding any mutation capability for agents, decide this first:

> Should trusted agents be allowed to directly edit documents, and if so, do direct agent edits require an automatic pre-edit snapshot?

Recommended answer for now:
- Keep only read-only harness capabilities merged.
- Next phase should be a design-only plan for agent permissions and snapshots, not more mutation code.

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
