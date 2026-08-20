# MinuNotes Shared Collaboration Agent Eval

Use dedicated staging resources, disposable owner/collaborator accounts, and test credentials. Never run these scenarios against production notes.

## Setup

- Create one owner folder with a Markdown note, canvas, child folder, and API-editable note.
- Create separate direct-note and folder grants for the collaborator.
- Prepare Viewer, Commenter, and Editor grants as separate disposable cases.
- Create API-key and OAuth/MCP connections for the collaborator with known capabilities.
- Record only safe resource IDs and provider message/request IDs; do not log invitation addresses or internal user IDs.

## Shared-scope modes

- [ ] `none` excludes every shared note and folder from list, search, line search, tags, links, and direct reads.
- [ ] `specific` includes only selected active grants and rejects an empty or stale selection.
- [ ] `all` includes current grants and a grant created after the connection was configured.
- [ ] Changing `all` or `specific` back to `none` removes shared discovery immediately.

## Privacy-safe discovery

- [ ] Folder listing returns compact shared roots/descendants with no owner, grant, authorization, or inaccessible-ancestry identifiers.
- [ ] Direct-note search/read/line results use `folderId: null` and do not reveal folder title, parent, siblings, or owner identifiers.
- [ ] Folder-granted note results retain only authorized subtree context.
- [ ] Links, backlinks, tags, orphans, attachments, and canvas links omit inaccessible resources.
- [ ] The agent treats `404` as inaccessible/revoked/trashed rather than proof of deletion.

## Effective capabilities

- [ ] Viewer mutation attempts are denied and stop after the first denial.
- [ ] Commenter can use Review when the connection has comment capability but cannot edit canonical content.
- [ ] Editor can edit API-editable notes when credential capability and owner safety policy allow it.
- [ ] Editor cannot edit a non-API-editable note or write through an agent-read-only/private folder.
- [ ] Editor can create a note/canvas in a shared folder when permitted; the stored resource belongs to the folder owner and retains agent attribution.
- [ ] Shared notes cannot be moved, reshared, or used to change folder structure/public-link policy. Direct-note grants cannot Trash the shared note.
- [ ] A shared-folder Editor may move only resources created by that authorizing user to the owner’s Trash; shared roots, mixed-creator subtrees, and owner-managed sharing configuration are denied.
- [ ] Viewer/Commenter agents and edit-disabled credentials cannot Trash; edit-capable agents remain bounded by human role, selected shared scope, API editability, and agent-read-only policy.

## Collaborative editing behavior

- [ ] An explicit narrow edit proceeds after a fresh read without an unnecessary approval round trip and ends with a concise changed-section summary.
- [ ] A feedback or review request produces anchored Review comments rather than unrequested canonical edits.
- [ ] A broad rewrite, substantial deletion, structural reorganization, or ambiguous change produces a proposed plan/diff and waits for approval.
- [ ] Uncertain collaborator intent results in a question or anchored comment rather than silent rewriting.
- [ ] Routine edits do not dump full diffs unless requested; broad approved edits retain enough diff evidence for review.

## Freshness and safe failure

- [ ] Downgrading Editor to Commenter denies edit/create on the next tool call.
- [ ] Revoking the human grant removes direct and delegated integration access immediately.
- [ ] Removing a selected grant from `specific` removes access without rotating the credential.
- [ ] A stale `baseHash` returns conflict and the agent rereads before proposing another edit.
- [ ] Permission failures are reported without probing unrelated folders or attempting scope expansion.

## Transports

- [ ] Direct Harness API behavior matches hosted OAuth/MCP behavior.
- [ ] MCP tool descriptions explain shared scope, direct-note privacy, owner-corpus creation, and owner-only operations.
- [ ] OpenAPI exposes privacy-safe role/source context only on full note reads.

## Evidence

Capture sanitized request/response excerpts, resulting safe resource IDs, full-read role/source context, and final grant state for each scenario. Record failures as product defects rather than weakening the expected boundary.
