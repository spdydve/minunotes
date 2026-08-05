# Trash and Recovery

## Scope

MinuNotes uses recoverable soft deletion for notes, templates, and folder subtrees. Trash lifecycle mutations are available only to authenticated users through the internal application API and the `/trash` interface.

Trash operations are intentionally not exposed through the harness API, OpenAPI agent surface, hosted MCP, local MCP, OAuth tools, or API keys.

## Lifecycle

Content has three lifecycle states:

1. **Active** — visible through the application and authorized integrations.
2. **Recoverable** — stored with `deleted_at`, hidden from active reads, and listed in Trash.
3. **Purged** — permanently removed after explicit typed confirmation.

There is no automatic retention or scheduled purge. Recoverable content remains in Trash until a user restores or permanently deletes it.

### Notes and templates

An individually trashed note or template receives `deleted_at` and a null `trash_batch_id`. Its content, versions, activity, tags, links, template assignments, and attachment records remain stored while it is recoverable.

Restoration uses the original folder when that folder is active. If the original folder is missing or trashed, the user must select an active destination they own.

### Folder subtrees

Trashing a folder computes its active descendant tree with cycle protection. The root folder ID becomes `trash_batch_id` for the root, active descendants, and active notes in that subtree.

Restoring the batch preserves its internal hierarchy. If the root's original parent is unavailable, the root is restored at the top level.

Items trashed separately remain separate Trash entries. Permanent deletion of a parent batch:

- is blocked while separately trashed notes still reference folders in that batch;
- detaches separately trashed child roots before deleting the parent batch;
- preserves inherited private and agent-read-only restrictions on detached roots;
- rehomes version and attachment folder references for notes that moved outside the purged subtree.

## Active-content policy

Normal reads require both of the following:

- the note or folder itself has no `deleted_at` value;
- every folder ancestor is active.

The shared predicates in `src/api/trash/policy.ts` apply this rule to application routes, harness commands, attachments, versions, tags, links, shares, shared wikilinks, API keys, and OAuth-backed MCP calls.

A trashed ID returns `404` through active-content APIs. Search, folder listings, recent notes, tags, backlinks, outgoing-link resolution, orphan results, line search, and attachment reads omit trashed content. Links to trashed targets remain stored but resolve as unavailable until restoration.

## Sharing and authorization

Trashing content atomically revokes affected public note and folder share links. Restoration never reactivates a revoked link; the owner must create a new share.

Trash listing, restore, and purge routes require an authenticated owner session under `/internal/trash`. They are not included in the harness OpenAPI document or MCP tool registry.

Harness, OpenAPI, hosted MCP, local MCP, OAuth, and API-key clients:

- can access only active content allowed by their existing folder scope;
- receive not-found responses for trashed notes and folders;
- cannot list Trash or trash, restore, or permanently delete content.

This boundary prevents an integration token from becoming a recovery or destructive-administration credential.

## Attachments and permanent deletion

Attachment objects remain available only while their note is active. Trashing a note immediately blocks attachment reads without deleting stored bytes.

Permanent deletion claims the trashed item, deletes its attachment objects from configured storage, and then removes database rows transactionally. If object deletion fails, the purge claim is released so the item remains recoverable and visible in Trash.

Unused tags are removed after permanent note deletion. Attachments and metadata belonging to unrelated notes are preserved.

## Internal endpoints

Authenticated application routes:

```txt
GET    /internal/trash
POST   /internal/trash/notes/:noteId/restore
DELETE /internal/trash/notes/:noteId
POST   /internal/trash/folders/:folderId/restore
DELETE /internal/trash/folders/:folderId
```

The existing note and folder delete routes now move active content to Trash:

```txt
DELETE /internal/notes/:noteId
DELETE /internal/folders/:folderId
```

Only permanent deletion requires typing `delete` in the application.

## Migration and operations

Migration `0024_soft_starbolt.sql` adds nullable `deleted_at` and `trash_batch_id` columns and indexes. Existing rows migrate with null values and remain active.

Production migration, deployment, release, and any future retention worker remain separate approval-gated operations.
