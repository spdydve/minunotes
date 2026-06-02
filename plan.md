# Notes MVP Implementation Plan

## Current Objective
Keep Notes as a personal markdown-first notes app with external API access for agents, scripts, and tools.

The current focus is:
- hardening API access
- improving auditability
- keeping the harness simple
- avoiding heavyweight versioning/drafts/publishing for now

## Current Product Direction

### Product language
- UI/product: Notes
- API access/settings: API Access
- Internal harness/domain: document/document commands where useful

### Core principles
- `notes.content` is canonical markdown.
- The app API remains note-native and optimized for UI/autosave.
- The harness remains a thin layer over markdown reads/writes.
- API keys are generic external access, not only for agents.
- API permissions are folder-scoped.
- Notes can block API edits with `is_api_editable`.
- No drafts/published model yet.
- No full version history yet.
- No snapshots yet.
- No suggestions/review workflow yet.
- No realtime/WS/SSE yet.

## Current State Summary
The following are already in place:
- internal harness command seam
- note discovery/search commands
- read-only outline/section parsing
- patch-style note edits
- note creation through harness
- stale document detection with `contentHash`
- session-authenticated harness API
- API key auth for harness
- secure API key format and verification
- folder-scoped API key permissions
- API Access settings page
- folder-level API Access controls
- minimal update metadata on notes (`updated_by_actor_type`, `updated_by_actor_id`)
- revoke confirmation for API keys
- test coverage for pure harness and API key utilities

## Important Decisions
- Keep Notes simple and personal-use-first.
- Use API Access as the generic concept instead of agent-only language.
- Keep global API Access as the primary control plane.
- Also support folder-level API Access as the inverse control plane.
- Folder permissions are currently the main boundary; workspaces are deferred.
- Minimal audit/event logging should come before heavier versioning or drafts.

## Active Phase — Minimal Audit / Activity Logging
Goal: add a lightweight append-only audit trail for note mutations without introducing full versioning.

### Why this next
We want better trust/debuggability for API and app edits, but drafts/published and full history are too heavy right now.

### Current session scope
Keep this pass small and note-focused:
- add append-only note events for note mutations
- emit events from create/update/edit/move/toggle API editable flows
- defer API key lifecycle auditing for a later phase unless needed

### Proposed table
- `note_events`
  - `id`
  - `note_id`
  - `user_id`
  - `actor_type`
  - `actor_id`
  - `event_type`
  - `summary`
  - `before_hash`
  - `after_hash`
  - `created_at`

### Initial event types
- `create`
- `update`
- `edit_patch`
- `move`
- `toggle_api_editable`

Deferred for a later phase:
- `api_access_changed`
- `revoke_api_key`

### Files to modify/create
- `src/api/db/schema.ts`
- `drizzle/*`
- `src/api/harness/commands.ts`
- possibly `src/api/routes/api-keys.ts`
- optionally `src/frontend/routes/notes.$noteId.tsx` later for simple display
- `tests/*` as needed

### Checklist
- [x] Add `note_events` schema.
- [x] Add migration.
- [x] Write note events from create/update/edit/move/toggle paths.
- [x] Record `before_hash` / `after_hash` where applicable.
- [x] Keep this append-only.
- [x] Defer API key lifecycle audit events for now.
- [x] Do not build full history UI yet.

### Verification
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] `pnpm db:migrate` succeeds.

Read-only activity surface verification:
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

## Completed Phase — Read-Only Activity Surface
Goal: expose the event stream without building full version restore/diff tooling.

### Current session scope
- add read API for note events
- add a simple note activity list in the note view
- keep the activity surface read-only

### Checklist
- [x] Add read API for note events.
- [x] Add simple note activity UI.
- [x] Keep it read-only.

## Completed Phase — Line-Aware Harness Search / Reads
Goal: add grep-like niceties for agents/scripts without recreating grep or replacing full-note reads.

### Current session scope
- add line range reads for individual notes
- add line-aware substring search for one note and across readable notes
- keep full-note reads as the default comprehension path
- return enough context to reduce repeated tool calls

### Proposed endpoints
- `GET /harness/notes/search-lines?q=...&context=2&limit=25`
- `GET /harness/notes/:noteId/search-lines?q=...&context=2&limit=25`
- `GET /harness/notes/:noteId/lines?from=1&to=80`

### Checklist
- [x] Add pure line helpers.
- [x] Add command functions for line ranges and line search.
- [x] Add harness endpoints.
- [x] Enforce API key read permissions.
- [x] Add tests for line helpers.
- [x] Keep this API-shaped, not grep-compatible.

## Active Phase — API Hardening + Release Readiness
Goal: add a small MVP-safe protection pass before production deployment and capture the remaining release tasks.

### Why this next
Core MVP feature work is effectively in place. The main remaining risk is operational hardening around public API access and release process gaps.

### Current session scope
Keep this pass small and deployment-focused:
- tighten API CORS policy for production
- add lightweight rate limiting for sensitive routes
- add request body size limits for create/edit/update routes
- add minimal API-safe security headers
- verify consistent unauthorized/forbidden behavior where needed
- create a release readiness checklist after the protection work lands
- align config/auth handling a bit more closely with munobrief where it improves safety and clarity
- keep this limited to env validation and explicit config derivation, not a larger auth rewrite

### Files to modify/create
- `plan.md`
- `sst.config.ts`
- `src/api/index.ts`
- `src/api/lib/auth.ts`
- `src/api/lib/env.ts` — new env/config parsing helper.
- `src/api/middleware/authentication.ts`
- `src/api/routes/harness.ts`
- `src/api/routes/notes.ts`
- `src/api/routes/folders.ts`
- `src/api/routes/api-keys.ts`
- `src/api/middleware/rate-limit.ts` — new lightweight limiter middleware.
- `src/api/middleware/request-limits.ts` — new request size guard middleware.
- `src/api/middleware/security-headers.ts` — new minimal API-safe headers middleware.
- `tests/api-access.test.ts`
- `tests/env.test.ts` — env/config helper coverage.
- `tests/harness.test.ts`
- additional tests as needed

### Checklist
- [x] Replace wildcard CORS with env-driven allowed origin handling.
- [x] Keep local development origins working.
- [x] Add lightweight rate limiting for `/api/auth/*`.
- [x] Add lightweight rate limiting for `/api/api-keys/*`.
- [x] Add lightweight rate limiting for `/api/harness/*`.
- [x] Add request body size limits for note/folder/API key write endpoints.
- [x] Add minimal API-safe security headers.
- [x] Verify unauthorized / forbidden responses remain consistent.
- [x] Add or update tests for the protection middleware.
- [x] Add a short release readiness checklist section to this plan.
- [x] Add a shared env/config helper for API/auth settings.
- [x] Centralize allowed-origin parsing.
- [x] Derive local/stage URL defaults more explicitly in SST config.
- [x] Add tests for env/config parsing.

### Verification
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes.
- [ ] Manual smoke test for auth, notes CRUD, folder CRUD, API key flows, and harness reads/edits.
- [ ] Manual CORS check for allowed and disallowed origins.

### Release readiness checklist
- [ ] Set production values for `FRONTEND_URL`, `BETTER_AUTH_URL`, `API_ALLOWED_ORIGINS`, `BETTER_AUTH_SECRET`, `TURSO_DB_URL`, and `LIBSQL_AUTH_TOKEN`.
- [ ] Set `COOKIE_DOMAIN` if auth cookies need to work across subdomains.
- [ ] Run migrations against the production database.
- [ ] Verify sign in, sign out, and session persistence in production-like env.
- [ ] Verify note create/edit/move/delete flows.
- [ ] Verify folder create/rename/delete flows.
- [ ] Verify API key create/edit/revoke flows.
- [ ] Verify harness reads and edits with a scoped API key.
- [ ] Verify CORS for allowed and blocked origins.
- [ ] Confirm monitoring/log capture for API errors.
- [ ] Confirm database backup / restore plan.
- [ ] Deploy to staging before production.

## Active Phase — Image Attachments / Object Storage
Goal: add MVP image upload handling while keeping markdown URL-first and storage backend swappable.

### Current session scope
Keep this pass focused on app-owned image uploads and rendering:
- store uploaded image bytes outside `notes.content`
- store normal markdown URLs for app-owned images, e.g. `/api/attachments/:attachmentId/content`
- preserve external image URLs in markdown
- add a generic object storage interface with a local filesystem implementation first
- leave SST/S3 wiring as the next backend once the seam is proven

### Proposed data model
- `attachments`
  - `id`
  - `user_id`
  - `note_id`
  - `folder_id`
  - `filename`
  - `mime_type`
  - `size`
  - `content_hash`
  - `storage_key`
  - `created_at`
  - `updated_at`

### Files to modify/create
- `plan.md`
- `src/api/db/schema.ts`
- `drizzle/*`
- `src/api/lib/env.ts`
- `src/api/storage/object-storage.ts` — new storage adapter interface.
- `src/api/storage/filesystem-storage.ts` — new local/Docker-compatible adapter.
- `src/api/storage/index.ts` — new storage factory.
- `src/api/routes/attachments.ts` — new upload/metadata/content routes.
- `src/api/index.ts`
- `src/frontend/lib/api.ts`
- `src/frontend/components/note-editor.tsx`
- `src/frontend/routes/notes.$noteId.tsx`
- `tests/attachments.test.ts` — new API/storage route coverage.
- `tests/env.test.ts`
- `sst.config.ts`
- `src/api/storage/s3-storage.ts` — new S3/S3-compatible adapter.
- additional tests as needed

### Checklist
- [x] Add `attachments` schema and relations.
- [x] Add migration.
- [x] Add env/config for attachment storage driver and filesystem path.
- [x] Add generic object storage interface.
- [x] Add filesystem object storage adapter for local/Docker path.
- [x] Add authenticated upload endpoint for note images.
- [x] Validate upload content type and size.
- [x] Create attachment metadata records after successful storage writes.
- [x] Return stable markdown URL for app-owned images.
- [x] Add authenticated content/download route for app-owned images.
- [x] Enforce note/folder ownership on upload and download.
- [x] Add frontend upload action in the note editor.
- [x] Insert returned markdown image URL into `notes.content`.
- [x] Preserve external markdown image URLs without rewriting.
- [x] Defer S3/SST bucket implementation until the local adapter and API shape are verified.
- [x] Add S3/S3-compatible storage adapter.
- [x] Add SST bucket wiring for non-local deployments.
- [x] Add S3 config env vars for bucket, region, endpoint, and path-style mode.
- [x] Add S3 signed upload URL creation endpoint.
- [x] Add pending/ready attachment status.
- [x] Add signed upload complete endpoint that verifies object existence when supported.
- [x] Update frontend upload flow to prefer signed S3 uploads and fall back to local app-proxy upload.
- [x] Configure SST bucket CORS for signed browser uploads.
- [x] Document local S3/S3-compatible env overrides in `.env.example`.

### Verification
- [x] `pnpm db:generate` creates the migration.
- [x] `pnpm db:migrate` succeeds locally.
- [x] `pnpm test` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] `pnpm db:migrate` succeeds after signed upload status migration.
- [ ] Manual upload smoke test inserts `![alt](/api/attachments/:id/content)` into markdown.
- [ ] Manual note reload confirms app-owned image URLs render.
- [ ] Manual external image URL check confirms external URLs remain unchanged.

## Planned Phase — Attachment Reference Tracking / Orphan Cleanup
Goal: safely clean up app-owned uploaded images after they are removed from note markdown, without breaking undo/version-history-friendly behavior.

### Product behavior
- Uploaded images remain normal markdown URLs: `/api/attachments/:attachmentId/content`.
- Removing an image from a note removes the markdown reference first; it should not immediately delete the file.
- The backend tracks whether each attachment is still referenced by note content.
- Unreferenced attachments are retained for a grace period, then deleted by cleanup.
- Re-adding an attachment URL before cleanup should mark it referenced again.

### Proposed data model additions
- `attachments.referenced_at` — last time the attachment was found in note markdown.
- `attachments.unreferenced_at` — when the attachment became orphaned, nullable.
- `attachments.deleted_at` — soft-delete marker after cleanup, nullable.
- Optional later: `attachments.reference_source` or `attachment_references` table if references can span multiple notes.

### Files to modify/create
- `plan.md`
- `src/api/db/schema.ts`
- `drizzle/*`
- `src/api/harness/commands.ts`
- `src/api/routes/notes.ts`
- `src/api/routes/attachments.ts`
- `src/api/storage/index.ts`
- `scripts/cleanup-attachments.ts` — new cleanup job/script.
- `tests/attachments.test.ts`
- additional tests as needed

### Phase 1 — Parse and sync note attachment references
- [x] Add helper to extract app-owned attachment IDs from markdown.
- [x] Add unit tests for markdown image/link parsing.
- [x] Add attachment reference columns and migration.
- [x] On note create/update/edit, sync references for that note.
- [x] Mark currently referenced attachments with `referenced_at` and clear `unreferenced_at`.
- [x] Mark previously referenced but now missing attachments with `unreferenced_at`.
- [x] Do not delete storage objects in this phase.

### Phase 2 — Protect reads and metadata from deleted/unowned attachments
- [x] Keep existing ownership checks for attachment content reads.
- [x] Exclude or reject `deleted_at` attachments from content reads.
- [x] Decide response for deleted content: 404 preferred.
- [ ] Add tests for deleted/unreferenced read behavior.

### Phase 3 — Cleanup job with grace period
- [ ] Add cleanup script that finds attachments with `unreferenced_at` older than configured grace period.
- [ ] Delete object storage file first, then set `deleted_at`.
- [ ] Make cleanup idempotent and safe if storage object is already missing.
- [ ] Add env/config for grace period; default 7–30 days.
- [ ] Add tests for cleanup selection and idempotency.

### Phase 4 — Operational integration
- [ ] Wire cleanup script into deployment/runtime schedule if needed.
- [ ] Document local/manual cleanup command.
- [ ] Consider admin/debug listing for orphaned attachments.

### Verification
- [x] `pnpm db:generate` creates expected migration.
- [ ] `pnpm db:migrate` succeeds locally.
- [x] `pnpm test` passes.
- [x] `pnpm exec tsc --noEmit` passes.
- [ ] Manual: upload image, remove markdown URL, save note, confirm attachment becomes unreferenced.
- [ ] Manual: re-add URL before cleanup, save note, confirm unreferenced state clears.
- [ ] Manual: run cleanup after forced old `unreferenced_at`, confirm content route returns 404.

## Deferred
Do not implement these until explicitly planned:
- workspaces
- drafts/published model
- full version history
- snapshots/restore
- suggestions/review UI
- comments
- CodeMirror AI highlights
- realtime / WebSockets / SSE
- MCP adapter
- advanced collaboration

## Immediate Notes
- API key format/security is already upgraded.
- Folder-level and global API Access controls are both implemented.
- Reduced note-events-only audit pass is implemented.
- Local migrations have been applied during this session; continue to run `pnpm db:migrate` after schema changes.
