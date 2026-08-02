# Shared-View Wikilinks

## Goal

Make wikilinks clickable in public, read-only note and folder shares without exposing private note metadata, bridging unrelated share capabilities, mounting the editor, or serving stale content after owner changes.

Shared views continue to use `MarkdownRenderer` through the thin application-level `NotesMarkdownRenderer` adapter. The adapter owns common static presentation such as syntax highlighting and lightweight code-block Copy controls without mounting CodeMirror. `SharedMarkdownRenderer` remains the public-policy layer: it decorates rendered `[[Target]]` and `[[Target|Label]]` syntax and applies only public destinations supplied by the API.

## Optimization priorities

The implementation prioritizes:

1. Share capability boundaries and private-data safety.
2. Correct navigation and unresolved-link behavior.
3. Immediate freshness after edits, revocation, regeneration, and deletion.
4. A simple implementation with bounded database work.
5. Performance optimization only after production measurement.

The feature does not redesign the existing shared-folder payload. Folder payload size is a separate performance concern and should be changed only with measurements and its own compatibility plan.

## Capability model

Share tokens are bearer capabilities, not proof that every active share owned by the same user belongs to the same audience.

### Single-note share

An authored wikilink resolves when:

- it is a self-link, in which case it points to the current shared note; or
- the target has its own active, unexpired note-share link.

A note-share viewer is never given an unrelated folder-share token merely because the source note is stored in that folder.

### Folder share

For a source note inside an active folder share:

- a target inside the shared folder subtree points to the same folder-share URL with `?note=<note-id>`;
- a target outside the subtree resolves only when it has its own active, unexpired note-share link;
- every other target remains unresolved.

The folder endpoint already exposes note IDs within its shared subtree, so using an in-scope note ID in the public search parameter reveals no additional private metadata.

## Source-bound resolution

The API never accepts an arbitrary target array from a public viewer. It loads the authorized source note and extracts wikilinks from that note's markdown.

This prevents a viewer from using one share token as a general title-guessing resolver. It also makes the returned resolution list correspond to the content being rendered.

Resolution rules:

- At most 100 unique authored targets are considered per note load.
- Inline-code and fenced-code examples are excluded.
- Stable `note_...` targets resolve by owner-scoped note ID.
- Legacy title targets resolve only when the owner has exactly one matching note.
- Candidate notes are always scoped to the source owner.
- Revoked and expired target shares are excluded.
- Unresolved results contain only the authored target and `href: null`.

The response never includes a private note title, folder, owner, internal `/notes/...` URL, or other workspace metadata.

## Public response contracts

### Shared note

`GET /internal/share/:token`

The existing note and share summary are returned with source-bound resolutions:

```json
{
  "note": {
    "title": "Public note",
    "content": "See [[Project Plan]]",
    "documentType": "markdown",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  },
  "share": {
    "id": "share_...",
    "permission": "read",
    "createdAt": "2026-08-01T00:00:00.000Z"
  },
  "resolutions": [
    { "target": "Project Plan", "href": "/share/target-token" }
  ]
}
```

### Selected note in a folder share

`GET /internal/share/folders/:token/notes/:noteId/wikilinks`

The server verifies that the folder token is active and that `noteId` belongs to its subtree before resolving the note's authored links:

```json
{
  "resolutions": [
    {
      "target": "Project Plan",
      "href": "/share/folders/current-folder-token?note=note_project"
    },
    { "target": "Private Draft", "href": null }
  ]
}
```

The endpoint accepts no request body or caller-supplied targets.

## Frontend behavior

`NotesMarkdownRenderer` standardizes application-level static presentation while delegating Markdown parsing to MinuEditor's `MarkdownRenderer`. It supplies the default MinuNotes highlighter and a static fenced-code shell with language, Copy feedback, themed header/body surfaces, and safe fallback rendering for unsupported or unlabeled code. It does not resolve notes or contain share authorization logic.

`SharedMarkdownRenderer` composes that adapter and post-processes the semantic HTML for public wikilinks:

- resolved links receive `me-wikilink--resolved` and the server-provided public `href`;
- unresolved links retain `me-wikilink--unknown` and have no `href`;
- only hrefs beginning with `/share/` are accepted;
- existing links, inline code, fenced code, scripts, styles, and similar code-like elements are not decorated;
- resolution updates remove any stale href before applying the latest result.

`MarkdownRenderer` is memoized inside `NotesMarkdownRenderer` so a resolution-only update does not replace its rendered HTML and remove imperative enhancements such as table-scroller wrappers. The static adapter is intentionally not a Markdown parser fork; richer static-shell and structured renderer extension support should move upstream to MinuEditor over time.

Folder note selection is stored in `?note=<note-id>`. This makes folder wikilink destinations directly loadable and preserves browser navigation without adding a new route hierarchy.

## Database work

Resolution uses bounded batch operations rather than per-target queries:

1. Load all matching owner-scoped candidate notes in one query.
2. Load active note shares for all candidates in one query.
3. For folder context, load the owner's folder rows once and compute the shared subtree in memory.

The number of repository calls does not grow with the number of targets. The target cap also bounds query parameters and response size.

## Why there is no application TTL cache

The initial LRU cache was removed because it optimized hypothetical viral traffic at the cost of correctness and security.

Immediate invalidation would have needed to cover:

- user and harness edits;
- version restoration;
- note creation, movement, and deletion;
- folder creation, movement, rename, and deletion;
- ancestor folder shares containing descendant notes;
- share creation, revocation, regeneration, and expiry;
- cached source resolutions that depended on a different target share.

A process-local cache also provides incomplete viral protection across multiple serverless instances. Entry-count limits do not bound memory when values may contain large note or folder payloads, and concurrent cold misses still duplicate work without request coalescing.

Without the cache:

- every request revalidates the active share token;
- owner edits are visible on refresh;
- revocation and regeneration take effect immediately;
- deletion cannot leave cached public content behind;
- the implementation has no cross-route invalidation matrix to maintain.

## If caching becomes necessary

Add caching only after production measurements identify a specific bottleneck. Prefer the following order:

1. **Client query caching** for the current page lifecycle.
2. **Conditional requests and ETags** to reduce transferred content while retaining validation.
3. **In-flight request coalescing** to collapse identical concurrent work without retaining stale responses.
4. **CDN or distributed caching** with an explicit purge mechanism and documented maximum stale window.
5. **Application caching**, only if earlier options are insufficient.

Any future application cache must include:

- hashed keys that preserve response-order semantics;
- byte-based limits, not only entry counts;
- expiry no later than the underlying share capability;
- dependency- or version-based invalidation covering source and target changes;
- immediate handling for revoke, regenerate, and delete;
- cold-concurrency coalescing;
- tests instrumenting actual computation and database calls;
- load-test evidence showing meaningful origin or database reduction across the deployed topology.

Per-IP rate limiting and audit logging remain separate hardening options. Per-IP limits do not solve aggregate viral traffic, and neither feature is required for the source-bound resolution contract.

## Verification coverage

- `tests/shared-wikilinks.test.ts` covers source binding, capability boundaries, ambiguity, stable IDs, expiry/revocation, cross-user isolation, folder scope, target caps, and bounded repository calls.
- `tests/share-links.test.ts` covers resolutions in shared-note responses and immediate target-share revoke freshness.
- `tests/folder-share-links.test.ts` covers subtree authorization and immediate folder-share revocation.
- `tests/browser/shared-wikilinks.spec.ts` covers resolved and unresolved rendering, note-share navigation, direct folder deep links, in-folder navigation, and back behavior.
- `tests/browser/folder-sharing.spec.ts` protects existing shared-folder rendering, including table-scroller behavior across resolution updates.
