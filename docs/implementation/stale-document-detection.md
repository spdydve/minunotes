# Stale Document Detection

**Status:** Implemented and regression-tested.

## What changed

- Markdown and canvas saves send the editor’s latest known `contentHash` as `baseHash`.
- Stale-status polling starts after asynchronous note hydration instead of silently remaining inactive.
- A `409 Conflict` preserves the local title and content in tab-scoped session storage and shows the stale-note warning.
- Users can compare the local draft with the latest saved content side by side and copy either local field.
- Closing review, reloading, or navigating away does not discard the preserved draft.
- Only an explicitly confirmed **Discard local draft** action clears it; that action never changes the saved server version.
- A draft is also cleared when the server already contains the attempted title and content.
- API and browser tests cover clean external updates, dirty save races, restoration, explicit discard, and canvas saves.

## Why

The initial stale-document implementation used hash-protected saves, but a later conflict-handling refactor stopped sending `baseHash`. The backend still supported conflict responses, yet normal editor saves could no longer trigger them. Polling also failed to register after an asynchronously loaded note, so clean external changes could go undetected.

Together, those regressions allowed a local autosave to overwrite newer content written by an agent or another client without warning.

## Impact

- Prevents silent last-write-wins data loss when notes change elsewhere.
- Keeps conflicting local work recoverable within the current browser tab across review closure, reload, and navigation.
- Restores stale-change detection for clean open notes.
- Protects both Markdown and canvas documents through their shared save path.
- Does not change API contracts, database schema, polling frequency, or deployment infrastructure.

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

Action:

```txt
Reload
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

- [x] Add `GET /notes/:noteId/status`.
- [x] Add `api.noteStatus(noteId)` client helper.
- [x] Track `lastKnownContentHash` in note editor route.
- [x] Update `lastKnownContentHash` after successful save.
- [x] Send `baseHash` with note save requests.
- [x] Poll status every 20 seconds while the note is open and the tab is visible.
- [x] Detect external hash mismatch.
- [x] Show stale document banner.
- [x] Pause/prevent autosave while stale.
- [x] Add reload action.
- [x] Verify an external update triggers the banner and cannot overwrite a dirty local draft.
- [x] Keep the conflicting local title and content available for review and copying after reload.
- [x] Persist conflicting drafts in tab-scoped session storage across reload and navigation.
- [x] Compare local and latest saved content side by side.
- [x] Require explicit confirmation before discarding a local draft.

## Regression hardening

The original implementation sent `baseHash`, but a later conflict-handling refactor stopped including it in normal editor saves. Polling also failed to start after asynchronous note hydration because the polling effect did not depend on loaded note state.

The hardened behavior now:

- sends the latest known content hash with Markdown and canvas saves;
- starts polling after the note content hash is loaded;
- preserves a dirty local draft in tab-scoped session storage when an external update wins the race;
- restores that draft after review closure, reload, or navigation;
- shows local and latest saved Markdown or canvas content side by side;
- requires confirmed explicit discard without modifying the saved server version;
- reloads current server content without leaving the route stuck in a loading state; and
- has API and browser regression coverage for stale conflicts, clean-note polling, restoration, discard, and canvas saves.

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
