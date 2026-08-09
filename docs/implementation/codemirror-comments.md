# Review Comments and Threads

**Status:** Implemented for active Markdown notes.

## Product boundary

Review comments are external discussion metadata. Markdown remains canonical and is never changed by comment operations.

```txt
Markdown             canonical note content
Comment threads      anchored discussion metadata
MinuEditor           selection, highlights, gutter actions, local anchor mapping
MinuNotes            persistence, actors, authorization, threads, and lifecycle
```

P1 supports the authenticated note owner and authorized API-key/OAuth agents. Public-share visitors cannot access comments. Canvas comments, suggestions, mentions, notifications, reactions, and realtime collaboration are deferred.

## Persistence

`note_comment_threads` stores:

- note and owner scope;
- open/resolved state;
- range or whole-line offsets;
- quote, prefix, suffix, and document hash;
- detached state;
- creator and resolver actor identity; and
- lifecycle timestamps.

`note_comment_messages` stores ordered root messages and replies with actor identity and timestamps. Both tables cascade on permanent note deletion. Soft-deleted notes retain their comments, but active-note authorization hides them until restore.

Actor records retain internal ownership IDs for authorization. API responses serialize safe identities only: `owner`, a public API-key UID, or `integration`.

## Authorization

- Owners can list and mutate comments on their active Markdown notes.
- Integrations need explicit `canComment` plus note-folder read access for every comment operation.
- Review-only integrations do not need note edit permission, and `isApiEditable` controls canonical note edits rather than comments.
- `canEdit` does not imply `canComment`, and `canComment` does not imply `canEdit`.
- Existing and newly created credentials default `canComment` to false until the owner grants **Review comments** access.
- Message edits and deletes are author-only.
- The note owner or thread creator can resolve, reopen, or delete a thread.
- Templates, canvases, trashed notes, inaccessible folders, and public shares expose no comment surface.

## Anchors

An anchor contains exact source offsets, quoted Markdown, nearby context, a document hash, and optional detached state.

Creation and anchor updates require the current content hash. Stale hashes return `409 Conflict`; attached anchors must exactly match the current Markdown.

MinuEditor maps anchors through local edits. MinuNotes persists those mapped anchors after the corresponding note autosave succeeds. When a note changed elsewhere, reads reattach only when the quote has one unambiguous location, using context to disambiguate. Otherwise the thread is explicitly marked detached and never moved speculatively.

## Application UI

The note editor exposes **Review** as a secondary right-side panel on wide screens and a bottom panel on narrow screens. Users can:

- comment on selected text or a whole source line;
- open a thread from its highlight or gutter action;
- reply and edit their own messages;
- resolve or reopen threads;
- delete messages or complete threads; and
- review detached comments without highlighting unrelated text.

MinuEditor receives controlled root comment items with `showPanel: false`; the MinuNotes panel owns threaded discussion UI.

## API surfaces

Owner routes live under:

```txt
/internal/notes/:noteId/comments
```

Scoped integration routes mirror the lifecycle under:

```txt
/v1/harness/notes/:noteId/comments
```

Harness OpenAPI, generated Postman requests, hosted/standalone MCP adapters, and MCP Review tools use the same shared comment domain operations.

## Verification

Coverage includes:

- full thread/message lifecycle;
- owner and API-key attribution;
- cross-user, folder-scope, read-only, editability, Trash, Markdown-only, and authorship boundaries;
- stale and invalid anchors;
- unique reattachment and detached presentation;
- permanent-deletion cascade;
- OpenAPI and MCP adapters; and
- browser creation, replies, status changes, local anchor mapping, and narrow-screen Review UI.
