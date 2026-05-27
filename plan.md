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

## Active Phase — Line-Aware Harness Search / Reads
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
