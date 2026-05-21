# Notes MVP Implementation Plan

## Scope
Build a simple unauthenticated note-taking MVP with folders and notes.

- Folders are shown in a sidebar.
- Creating a folder opens a modal and captures a title before creation.
- Selecting a folder shows that folder's notes in a main-content table.
- Creating a note opens/loads an editor page with an untitled note.
- Users can retitle notes inside the editor.
- Authentication is deferred; schema can leave room for future Better-Auth ownership fields.

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

### Notes
- `POST /folders/:folderId/notes` — create untitled note in folder
- `GET /notes/:noteId` — get note editor payload
- `PATCH /notes/:noteId` — update title/content
- `DELETE /notes/:noteId` — optional MVP stretch

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
- [ ] Add frontend, backend, ORM, and tooling dependencies.
- [ ] Add Vite, Tailwind, and shadcn-compatible config.
- [ ] Add Drizzle config and environment example.
- [ ] Update SST config for API and frontend.

Verification:
- [ ] `npm install` succeeds.
- [ ] TypeScript config resolves frontend/backend imports.
- [ ] SST synth/dev command starts without config errors.

### Phase 2 — Database
- [ ] Define `folders` schema.
- [ ] Define `notes` schema.
- [ ] Generate initial migration.

Verification:
- [ ] Migration applies to local/remote LibSQL database.
- [ ] Drizzle schema type-checks.

### Phase 3 — Backend API
- [ ] Implement Hono app and Lambda adapter.
- [ ] Implement folder routes.
- [ ] Implement note routes.
- [ ] Add basic request validation.
- [ ] Add consistent JSON error responses.

Verification:
- [ ] API can create/list folders.
- [ ] API can create/list/update notes.
- [ ] Invalid inputs return 400-level responses.

### Phase 4 — Frontend Shell
- [ ] Implement app shell with sidebar dashboard layout.
- [ ] Implement folder sidebar query.
- [ ] Implement create-folder modal with TanStack Form.
- [ ] Implement empty states.

Verification:
- [ ] Dashboard loads with no authentication.
- [ ] Folder creation updates sidebar.
- [ ] Layout works in light/dark themes.

### Phase 5 — Notes Views
- [ ] Implement folder notes table with TanStack Table.
- [ ] Implement create-note action that navigates to editor.
- [ ] Implement note editor route.
- [ ] Implement note title editing.
- [ ] Implement note content editing with autosave or explicit save.

Verification:
- [ ] Clicking a folder shows its notes.
- [ ] Creating a note opens an untitled note editor.
- [ ] Retitling a note persists and updates table/sidebar state.

### Phase 6 — Polish
- [ ] Apply simple flat shadcn/Tailwind styling.
- [ ] Add loading, error, and empty states.
- [ ] Add minimal responsive behavior.

Verification:
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Manual MVP flow passes: create folder → create note → rename note → return to folder table.

## Follow-up Decisions Needed

1. Should note content support plain textarea only for MVP, or Markdown editing/preview?
2. Should note saving be autosave, explicit save button, or both?
3. Should deleting folders/notes be included in MVP or deferred?
4. Should folders be manually sortable, alphabetic, or newest-first?
5. Which LibSQL target should be used first: local file DB for dev, Turso remote, or both?
