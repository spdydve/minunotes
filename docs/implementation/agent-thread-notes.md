# Agent Thread Notes

## Goal
Provide a lightweight, markdown-native review and audit workflow for BYO agents without immediately building full suggestions, versions, operation history, or session tables.

## Core Idea
For each target note an agent works on, create or reuse a companion thread note.

```txt
Target note:       Project Plan
Agent thread note: Project Plan - Agent
```

The agent writes requests, context, analysis, proposed edits, and results to the thread note. The final edit is then applied to the target note as a separate deliberate step.

```txt
agent/user conversation and rationale = thread note
canonical document content = target note
```

## Why This Helps

Agent thread notes provide:

- human-readable audit history
- reviewable proposed edits
- recovery clues when an agent makes a bad change
- before/after content hashes
- a lightweight session model
- no new database tables required for MVP
- portable markdown
- compatibility with normal note workflows

This is especially useful for BYO agents where the app may not fully control the agent runtime.

## MVP Naming Convention

Use a simple visible naming convention:

```txt
<target note title> - Agent
```

Examples:

```txt
Roadmap - Agent
Architecture Notes - Agent
Meeting Summary - Agent
```

Longer-term, prefer an explicit relationship table instead of relying only on title matching.

## Recommended Agent Workflow

```txt
user asks agent to update a note
  ↓
agent finds target note
  ↓
agent finds or creates companion thread note
  ↓
agent appends session entry to thread note
  ↓
agent reads target note and records before hash
  ↓
agent writes analysis/proposed edit to thread note
  ↓
user or agent performs deliberate apply step
  ↓
agent updates target note using baseHash
  ↓
agent appends result and after hash to thread note
```

## Suggested Thread Note Template

```md
# Agent Thread for: {{noteTitle}}

Target note: {{noteId}}
Thread note: {{threadNoteId}}
Created: {{createdAt}}

---

## Session {{timestamp}}

### User Request

{{request}}

### Target

- Note: {{noteTitle}}
- Note ID: {{noteId}}
- Content hash before: {{beforeHash}}

### Context Read

- {{noteTitle}} — {{noteId}}

### Agent Analysis

{{analysis}}

### Proposed Edit

{{proposedEdit}}

### Apply Decision

- Status: pending | applied | skipped | failed
- Approved by: {{approvedBy}}

### Applied Edit

{{appliedEdit}}

### Result

- Status: applied | skipped | failed
- Content hash after: {{afterHash}}
- Error: {{errorIfAny}}
```

## Minimal Safety Rules

For BYO agents, use these rules:

1. Do not directly edit a target note without identifying or creating its thread note.
2. Record the user request in the thread note.
3. Record the target note ID and content hash before editing.
4. Write the proposed edit to the thread note before applying it.
5. Apply final edits only as a separate deliberate step.
6. Use `baseHash` when updating the target note.
7. Append result status and after hash to the thread note.

## Direct Edit vs Review

Agent thread notes support both workflows.

### Review-first

```txt
agent writes proposed edit to thread note
user reviews
user says apply
agent updates target note
```

Best for risky or external agents.

### Trusted direct edit

```txt
agent writes plan/proposed edit to thread note
agent applies edit immediately
agent records result
```

Best for trusted local agents.

Even in direct-edit mode, the thread note preserves a useful audit trail.

## Suggested Harness Commands Later

These can remain internal at first:

```txt
find_agent_thread
get_or_create_agent_thread
append_agent_thread_entry
read_agent_thread
apply_agent_edit
```

Possible function shape:

```ts
getOrCreateAgentThread({
  userId,
  targetDocumentId,
  agentId,
})
```

```ts
appendAgentThreadEntry({
  userId,
  threadDocumentId,
  targetDocumentId,
  markdown,
})
```

## Optional Relationship Table Later

For MVP, naming convention is enough. Later, add an explicit relation:

```txt
agent_threads
id
target_note_id
thread_note_id
agent_id
created_at
updated_at
```

This avoids ambiguity when target notes are renamed.

## Relationship to Suggestions

Agent thread notes are not a replacement for a full suggestions/review system, but they can delay the need for one.

They provide:

- review history
- proposed edit content
- final edit log
- before/after hashes

They do not provide:

- inline diff UI
- accept/reject controls
- automatic conflict resolution
- structured operation replay

## Recommended MVP

Start with markdown-only thread notes:

- create/find `<note title> - Agent`
- append session entries
- require before/after hashes
- use `baseHash` for final target note update
- avoid new DB tables until this workflow proves useful

This gives agents a practical, reviewable workspace while keeping the notes app simple.
