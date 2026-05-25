# MinuEditor Harness Architecture

## Overview

The MinuEditor Harness is a deterministic coordination layer that sits above `minueditor`.

Its responsibility is to coordinate:

- documents
- operations
- AI agents
- suggestions
- document versions
- orchestration
- persistence
- synchronization

The harness is intentionally separated from the editor.

```txt
minueditor
  = rendering + editing surface

harness
  = orchestration + persistence + AI coordination
```

The core philosophy is:

```txt
Markdown is the source of truth.
Operations are the mutation primitive.
Agents propose patches.
Humans approve changes.
```

---

# Goals

## Primary Goals

- Deterministic document editing
- AI-agent compatible workflows
- Replayable document history
- Human review of AI edits
- Simple persistence model
- Local-first friendly
- API/MCP compatible
- Minimal abstractions
- Extensible coordination system

## Non-Goals

- CRDT-first collaborative editing
- Rich text editor state persistence
- DOM mutation editing
- Notion-style block architecture
- Hidden AI metadata inside markdown

---

# Core Architecture

```txt
                 ┌─────────────────────┐
                 │      MinuEditor     │
                 │  (CodeMirror UI)    │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Harness Runtime   │
                 │  Operations Engine  │
                 └──────────┬──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Document Store │ │ Agent Runtime  │ │ API / MCP Layer│
└────────────────┘ └────────────────┘ └────────────────┘
```

---

# Core Principles

## 1. Markdown is Canonical

The markdown document is always the source of truth.

The editor should never persist:

- DOM trees
- Lexical JSON
- ProseMirror nodes
- rendered HTML

Only markdown should be persisted.

---

## 2. Operations are the Mutation Primitive

Documents are mutated through operations.

Agents never directly mutate the editor.

### Example

```ts
export type DocumentOperation =
  | {
      type: 'insert'
      at: number
      text: string
    }
  | {
      type: 'replace'
      from: number
      to: number
      text: string
    }
  | {
      type: 'delete'
      from: number
      to: number
    }
```

---

## 3. Agents Propose Changes

Agents propose patches.

Humans approve/reject patches.

This creates:

- trust
- auditability
- replayability
- deterministic history
- safer automation

---

## 4. Editor and Harness are Separate

The editor should focus on:

- rendering
- editing
- decorations
- UX
- selections
- widgets

The harness should focus on:

- persistence
- operations
- orchestration
- agents
- synchronization
- versioning
- validation

---

# Document Model

## Document

```ts
export interface Document {
  id: string
  title: string
  currentVersion: number
  markdown: string
  createdAt: string
  updatedAt: string
}
```

---

## Document Version

```ts
export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  markdown: string
  createdAt: string
}
```

---

## Document Operation Record

```ts
export interface DocumentOperationRecord {
  id: string
  documentId: string
  baseVersion: number
  resultingVersion: number

  actorType: 'user' | 'agent' | 'system'
  actorId?: string

  operation: DocumentOperation

  beforeHash: string
  afterHash: string

  createdAt: string
}
```

---

# Suggestions

Suggestions represent proposed edits.

They are not immediately applied.

## Suggestion

```ts
export interface Suggestion {
  id: string
  documentId: string

  agentId?: string

  baseVersion: number

  operation: DocumentOperation

  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'conflicted'

  reason?: string

  createdAt: string
}
```

---

# Section Model

Sections are semantic regions derived from markdown headings.

This allows AI agents to operate semantically instead of using raw offsets.

## Example

```md
# Research
## Ideas
## Notes
## Draft
```

---

## Section Interface

```ts
export interface DocumentSection {
  id: string

  heading: string
  level: number

  from: number
  to: number

  contentFrom: number
  contentTo: number
}
```

---

# Section Operations

## Examples

```txt
rewrite section "Architecture"
summarize section "Research"
append to section "Implementation"
```

Instead of:

```txt
replace range 1820-2490
```

---

# Harness Runtime

The runtime is responsible for:

- loading documents
- parsing sections
- applying operations
- validating operations
- detecting conflicts
- storing history
- synchronizing clients
- orchestrating agents

---

# Operation Lifecycle

```txt
Agent/User
    ↓
Create Operation
    ↓
Validate
    ↓
Apply Against Base Version
    ↓
Generate New Version
    ↓
Persist Operation
    ↓
Update Snapshot
    ↓
Notify Clients
```

---

# Conflict Handling

Each operation targets a specific document version.

## Example

```ts
{
  baseVersion: 12
}
```

If the current document version is:

```txt
13
```

the operation may:

- auto-rebase
- become conflicted
- require review

---

# Validation

Operations should be validated before application.

## Validation Examples

- invalid ranges
- stale versions
- malformed markdown
- restricted sections
- unsafe operations

---

# Snapshots vs Operations

The system should store:

## Operations

Append-only operation history.

## Snapshots

Periodic full markdown snapshots.

This enables:

- replay
- undo/redo
- branching
- time travel
- debugging
- audit history

---

# Suggested Persistence Strategy

## MVP

SQLite is acceptable for:

- local-first
- single-user
- lightweight coordination
- local agents

## Future Migration

Move to Postgres when introducing:

- multiple concurrent users
- background workers
- distributed agents
- collaboration
- queue orchestration
- hosted environments

---

# Suggested Database Tables

## documents

```txt
id
current_version
markdown
title
created_at
updated_at
```

---

## document_versions

```txt
id
document_id
version
markdown
created_at
```

---

## document_operations

```txt
id
document_id
base_version
resulting_version
actor_type
actor_id
operation_json
before_hash
after_hash
created_at
```

---

## suggestions

```txt
id
document_id
agent_id
base_version
operation_json
status
reason
created_at
```

---

# API Layer

The API layer should expose high-level document operations.

Avoid exposing raw editor mutation APIs.

---

# Recommended API

## Read APIs

```txt
get_document
get_document_outline
get_document_section
list_suggestions
```

---

## Mutation APIs

```txt
propose_patch
rewrite_section
append_to_section
accept_suggestion
reject_suggestion
```

---

# MCP Layer

The MCP layer should act as an adapter over the same command system.

MCP tools should be semantic.

## Good MCP Tools

```txt
read_document
rewrite_section
append_to_section
propose_patch
summarize_section
```

## Avoid

```txt
replace_range(from, to, text)
```

as the primary public abstraction.

---

# Rendering Suggestions in MinuEditor

Suggestions should render as:

- inline highlights
- diff decorations
- ghost text
- gutter indicators
- accept/reject controls

This should be implemented as CodeMirror decorations/widgets.

The editor should not own suggestion persistence.

---

# Future Extensions

## Possible Future Features

- comments
- threaded discussions
- multi-agent workflows
- agent memory
- semantic search
- vector indexing
- execution environments
- code block runtimes
- collaborative editing
- branching documents
- workflow automation

---

# Initial MVP

## Phase 1

- document persistence
- operation types
- operation application
- section parsing
- version tracking
- SQLite persistence

---

## Phase 2

- suggestions
- diff rendering
- accept/reject flow
- agent orchestration
- MCP adapter

---

## Phase 3

- synchronization
- collaboration
- conflict rebasing
- hosted runtime
- Postgres migration

---

# Recommended Package Structure

```txt
packages/
  minueditor/
  harness/
  markdown-parser/
  operations/
  agent-runtime/
  api/
  mcp/
```

---

# Final Philosophy

The editor is not the intelligence layer.

The editor is the deterministic markdown interface.

The harness coordinates:

- humans
- agents
- operations
- synchronization
- orchestration
- persistence

Markdown remains portable.

Operations remain auditable.

Agents remain controllable.

