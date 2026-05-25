# External Agent Helpers Roadmap

## Product Direction
The app should remain a personal markdown note-taking app first.

Agents are external helpers. They should not turn the app into a chat product.

Agents can:

- find notes
- read notes
- summarize notes
- create new notes
- append useful output to existing notes
- maybe update notes when explicitly allowed

The app itself stays focused on:

```txt
folders
notes
markdown
editor
search
organization
```

## Core Principle
Agent output should become markdown notes or markdown appended to notes.

Avoid introducing a chat panel, agent inbox, session timeline, or conversation UI until there is a clear product need.

## Recommended Harness Capability Model

### Read Capabilities

```txt
list_folders
list_documents
search_documents
read_document
get_document_outline
get_document_section
```

### Low-Risk Write Capabilities

```txt
create_document
append_to_document
```

These are the first write capabilities to add because they fit the note-taking model naturally.

### Higher-Risk Write Capabilities

```txt
replace_document
rewrite_section
```

These should be explicit and protected with `baseHash`, permissions, and possibly snapshots.

## Recommended MVP Agent Permissions

### Agents can always edit documents they created
If an agent creates a note, it can continue updating/appending/replacing that note.

Examples:

```txt
Workout Log Summary - Week 22
Monthly Training Summary
Agent Research Notes
Conversation Summary
```

This supports workflows like:

```txt
agent reads weekly workout log
agent creates a weekly summary note
agent updates that summary note later
```

### Agents need explicit permission for user-created documents
For user-created notes, agents should start with safer actions:

- read
- summarize
- append

Full replacement or section rewrite should be explicit.

## Example Workflows

### Conversation to New Note

```txt
user asks: save this conversation as a note
  ↓
agent lists folders or uses selected folder
  ↓
agent creates new note
  ↓
agent writes summary/transcript as markdown
```

Commands:

```txt
list_folders
create_document
```

### Append Summary to Existing Note

```txt
user asks: add this summary to my project note
  ↓
agent searches notes
  ↓
agent reads target note
  ↓
agent appends markdown section
```

Commands:

```txt
search_documents
read_document
append_to_document
```

### Workout Weekly Summary

```txt
agent reads Workout Log - Week 22
  ↓
agent creates Workout Summary - Week 22
  ↓
agent writes totals, trends, PRs, and notes
  ↓
agent can keep editing the summary because it created it
```

Commands:

```txt
search_documents
read_document
create_document
append_to_document
```

### Monthly Summary from Multiple Notes

```txt
agent searches workout logs for the month
  ↓
agent reads matching notes
  ↓
agent creates Monthly Workout Summary
  ↓
agent writes synthesized markdown summary
```

Commands:

```txt
search_documents
read_document
create_document
```

## Suggested Next Implementation Phases

## Phase 1 — Create and Append Documents

Goal: let agents create new notes and append useful markdown to existing notes.

Add internal harness commands:

```ts
createDocument({
  userId,
  folderId,
  title,
  markdown,
  actorType,
  actorId,
})
```

```ts
appendToDocument({
  userId,
  documentId,
  markdown,
  baseHash?,
  actorType,
  actorId,
})
```

Behavior:

- `createDocument` creates a normal note.
- `appendToDocument` appends markdown to the end of the note.
- `baseHash` is optional for user/app flows, but recommended for agents.
- No schema changes required if actor ownership is deferred.

Verification:

- agent can create a new note in a folder
- agent can append markdown to an existing note
- app autosave remains unchanged
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass

## Phase 2 — Agent Ownership Metadata

Goal: know which documents were created by agents.

Possible minimal schema addition:

```txt
notes.created_by_actor_type
notes.created_by_actor_id
```

Or use a separate table:

```txt
document_actor_ownership
id
document_id
actor_type
actor_id
relationship
created_at
```

Recommended relationship values:

```txt
creator
maintainer
```

MVP rule:

```txt
agents can always edit documents where relationship = creator or maintainer
```

## Phase 3 — Public/External Agent API

Goal: expose agent capabilities outside the app UI.

Possible endpoints:

```txt
GET  /harness/folders
GET  /harness/documents?folderId=
GET  /harness/documents/search?q=
GET  /harness/documents/:documentId
POST /harness/documents
POST /harness/documents/:documentId/append
```

Keep this separate from app autosave APIs.

Both app routes and harness routes should call shared internal command functions.

## Phase 4 — Safer Updates for Existing User Notes

Goal: allow direct edits of user-created notes when explicitly requested.

Add later:

```txt
replace_document
rewrite_section
```

Safety requirements:

- require `baseHash`
- reject stale edits with `409 Conflict`
- consider snapshot before replacing large content
- optionally record a markdown thread note or audit entry

## Deferred

Do not add until needed:

- chat panel
- agent inbox
- full suggestions/review UI
- document versions
- operation replay
- vector search
- comments
- CodeMirror AI highlights
- complex agent session tables

## Recommended Immediate Next Step
Implement Phase 1 only:

```txt
create_document
append_to_document
```

This gives agents useful write capability while keeping the app true to its current shape.
