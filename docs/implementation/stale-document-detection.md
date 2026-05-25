# Stale Document Detection

## Goal
Detect when a note currently open in the editor has been changed elsewhere, such as by an external agent, another browser tab, or a future API integration.

This is not real-time collaboration. It is lightweight stale-content awareness.

## Problem
A user may have a note open while an agent updates it in the background.

```txt
editor content = old markdown
database content = new markdown
```

Without detection, autosave could overwrite the agent's changes.

## Recommended MVP
Use polling plus `contentHash` conflict checks.

Avoid WebSockets and Server-Sent Events for now because the current SST/Lambda setup is better suited to request/response APIs.

## Phase 1 — Note Status Endpoint

Add a small read endpoint:

```txt
GET /notes/:noteId/status
```

Response:

```ts
{
  noteId: string
  contentHash: string
  updatedAt: string
}
```

Behavior:

- authenticate user
- load note through the harness/read path
- return only lightweight status metadata
- do not return full markdown content

Files likely modified:

```txt
src/api/routes/notes.ts
src/frontend/lib/api.ts
```

## Phase 2 — Editor Polling

When a note is open, poll status every 15–30 seconds.

Only poll when:

- document tab is visible
- note page is mounted
- no save is currently in flight

Suggested behavior:

```txt
load note
store lastKnownContentHash
poll /notes/:noteId/status
if server hash differs from lastKnownContentHash:
  show stale document banner
  pause autosave or prevent overwrite
```

Possible UI message:

```txt
This note was updated elsewhere. Reload to view the latest version.
```

Buttons:

```txt
Reload
Dismiss
```

Files likely modified:

```txt
src/frontend/routes/notes.$noteId.tsx
src/frontend/components/note-editor.tsx
```

## Phase 3 — Save Conflict Protection

Use the existing optional `baseHash` support on note updates.

When saving:

```ts
PATCH /notes/:noteId
{
  title,
  content,
  baseHash: lastKnownContentHash
}
```

If the backend detects a stale hash, return:

```txt
409 Conflict
```

Response:

```ts
{
  error: 'Document has changed since it was read',
  currentHash: string
}
```

Frontend behavior:

- stop autosave
- show conflict/stale banner
- do not silently overwrite remote changes
- allow user to reload

## MVP Checklist

- [ ] Add `GET /notes/:noteId/status`.
- [ ] Add `api.noteStatus(noteId)` client helper.
- [ ] Track `lastKnownContentHash` in note editor route.
- [ ] Update `lastKnownContentHash` after successful save.
- [ ] Send `baseHash` with note save requests.
- [ ] Poll status every 15–30 seconds while note is open and tab is visible.
- [ ] Detect external hash mismatch.
- [ ] Show stale document banner.
- [ ] Pause/prevent autosave while stale.
- [ ] Add reload action.
- [ ] Verify agent/harness edit behind the scenes triggers the banner.

## Verification

- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] Manual test: note loads normally.
- [ ] Manual test: editing/autosave works normally when no external edit occurs.
- [ ] Manual test: update note through harness while note is open; UI detects stale hash.
- [ ] Manual test: stale autosave does not overwrite external changes.
- [ ] Manual test: reload action loads latest content.

## Why Polling First

Polling is preferred for this project right now because it:

- works well with SST/Lambda
- avoids persistent connections
- is easy to reason about
- is cheap enough for personal/local-first note workflows
- requires no infrastructure changes
- uses existing `contentHash` support

## Future: WebSockets or SSE

As the app expands, a long-lived server may become useful.

Consider moving some runtime pieces to a server or realtime service when the product needs:

- live multi-client sync
- active agent progress updates
- collaborative cursors
- streaming agent edits
- presence indicators
- push notifications for document changes
- high-frequency change notifications

Possible future options:

```txt
SST/Lambda request-response API remains for core CRUD
long-lived Node/Bun server handles WS/SSE realtime features
managed realtime provider handles subscriptions
collaboration provider such as Yjs websocket server handles true live editing
```

## Recommendation
Do not move to a long-lived server yet.

Use polling for stale document detection. Revisit WS/SSE only when agents need live progress, push notifications, or collaborative editing.
