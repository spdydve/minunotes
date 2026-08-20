# Collaboration Security Hardening Plan

## Status

**Implemented and verified. Phases 1–6 are complete.**

## Goal

Close the four release-blocking authorization/security issues from the blast-radius review, add adversarial regression coverage, and complete the recommended privacy and tenant-integrity hardening without weakening existing owner, collaborator, API-key, OAuth, MCP, trash, or public-share behavior.

## Scope and sequencing

- Release blockers are Phases 1–4.
- Phase 5 adds privacy-safe serialization and fail-closed result handling.
- Phase 6 adds defense-in-depth tenant constraints and revocation documentation.
- Each phase must pass its focused tests before the next phase begins.
- Existing unrelated working-tree changes in `src/sst-env.d.ts` and `packages/email-protection/sst-env.d.ts` must not be modified.

## Phase 0 — Baseline and adversarial fixtures

### Changes

- [ ] Capture the current targeted test baseline before implementation.
- [ ] Add reusable fixtures for overlapping collaboration grants and API-key/OAuth authorization scopes.
- [ ] Keep API-key and hosted OAuth/MCP assertions behaviorally equivalent.

### Files

- Modify `tests/collaboration-access.test.ts`.
- Modify `tests/collaboration-agents.test.ts`.
- Modify `tests/harness-folder-access.test.ts`.
- Modify `tests/harness-canvas.test.ts`.
- Modify `tests/mcp-route.test.ts` only if hosted MCP behavior is not fully covered through the shared Harness adapter tests.

### Verification

- [ ] Existing collaboration and Harness tests pass before security changes.
- [ ] New adversarial tests fail for the reviewed vulnerabilities before their fixes are applied.

## Phase 1 — Isolate selected grants in `specific` integration scope

### Changes

- [ ] Resolve the authorization’s selected collaboration grant IDs before calculating effective integration access.
- [ ] In `specific` mode, discard every unselected applicable grant before calculating role, source, capabilities, and folder-context visibility.
- [ ] Require one or more selected grants to independently cover the requested resource and capability.
- [ ] Preserve current human collaboration behavior and `all`/`none` integration behavior.
- [ ] Ensure a selected direct-note grant cannot inherit folder context from an unselected folder grant.
- [ ] Ensure selected folder grants retain normal ancestor/subtree semantics only for the selected grant itself.

### Files

- Modify `src/api/lib/collaboration-access.ts`.
- Modify `tests/collaboration-access.test.ts`.
- Modify `tests/collaboration-agents.test.ts`.
- Modify `tests/harness-folder-access.test.ts`.
- Modify `tests/note-comments.test.ts` if comment capability coverage cannot be expressed cleanly in the integration tests above.
- Modify `tests/mcp-route.test.ts` for an explicit hosted OAuth/MCP regression assertion.

### Required regression matrix

- [ ] Selected folder-viewer + unselected direct-note editor.
- [ ] Selected direct-note viewer + unselected folder editor.
- [ ] Selected ancestor-folder viewer + unselected descendant-folder editor.
- [ ] Selected descendant grant does not authorize its ancestors or siblings.
- [ ] Read, edit, comment, note creation, folder creation, and direct-note folder-context behavior.
- [ ] API key and OAuth/MCP paths.
- [ ] `none`, `specific`, and `all` remain distinct.

### Verification

- [ ] `pnpm exec vitest run tests/collaboration-access.test.ts tests/collaboration-agents.test.ts tests/harness-folder-access.test.ts tests/note-comments.test.ts tests/mcp-route.test.ts`
- [ ] Confirm selected viewer grants never acquire editor/create/comment capability from unselected grants.

## Phase 2 — Enforce parent-folder scope for OAuth/MCP folder creation

### Changes

- [ ] Replace the API-key-only parent check with the integration-agnostic folder permission resolver.
- [ ] Require `create` permission on every non-null parent for API keys and OAuth/MCP.
- [ ] Apply private-folder and agent-read-only policy consistently.
- [ ] Preserve authorized top-level creation behavior.
- [ ] Create the new authorization folder rule only after parent authorization succeeds and keep insertion transactional.

### Files

- Modify `src/api/routes/harness.ts`.
- Modify `tests/harness-folder-access.test.ts`.
- Modify `tests/mcp-route.test.ts`.
- Modify `tests/oauth.test.ts` only if OAuth authorization setup needs direct route-level coverage beyond the MCP adapter test.

### Verification

- [ ] API key and OAuth/MCP receive `403` for known but out-of-scope parents.
- [ ] OAuth/MCP receive `403` for agent-read-only/private parents.
- [ ] No folder or authorization rule remains after a denied or failed request.
- [ ] Authorized parent and top-level creation continue to pass.
- [ ] `pnpm exec vitest run tests/harness-folder-access.test.ts tests/mcp-route.test.ts tests/oauth.test.ts`

## Phase 3 — Make Harness/MCP canvas access integration-aware and mutation-safe

### Changes

- [ ] Add an integration-aware canvas-link visibility resolver that evaluates every target through the current credential’s owned-folder permissions, shared access mode, selected collaboration grants, private-folder policy, and read capability.
- [ ] Sanitize both owned and shared canvas reads using integration scope rather than human-only collaboration access.
- [ ] Track hidden-link state internally; do not expose hidden target IDs or hidden-link counts in external DTOs.
- [ ] Return a content hash for the sanitized representation while retaining the raw hash internally for concurrency-safe writes.
- [ ] Reject submitted whole-canvas content containing targets the integration cannot read.
- [ ] Deny whole-canvas replacement and syntax replacement when the stored canvas contains hidden links, preserving the owner’s raw metadata.
- [ ] For targeted link operations, require read access to the target and prevent replacement of a hidden existing link.
- [ ] For targeted unlink operations, prevent removal of a hidden link and return no mutated content/hash that can act as an oracle.
- [ ] Preserve node external URLs and unrelated metadata on all allowed targeted operations.
- [ ] Re-sanitize every successful response so raw hidden metadata never leaves the Harness/MCP boundary.

### Files

- Modify `src/api/routes/harness.ts`.
- Modify `src/api/notes/links.ts`.
- Modify `src/api/lib/collaboration-access.ts` if a reusable integration target resolver belongs with authorization policy.
- Modify `src/api/harness/commands.ts` only if command inputs must distinguish externally validated sanitized hashes from internal raw hashes.
- Modify `tests/harness-canvas.test.ts`.
- Modify `tests/collaboration-agents.test.ts`.
- Modify `tests/mcp-route.test.ts`.
- Modify `tests/note-links.test.ts` for sanitizer/hash unit coverage if needed.

### Required regression matrix

- [ ] Owned canvas links to authorized, out-of-scope, private, and agent-read-only targets.
- [ ] Shared canvas links under `none`, `specific`, and `all` shared access.
- [ ] Selected versus unselected direct-note and folder grants.
- [ ] API-key and OAuth/MCP reads return identical sanitized results.
- [ ] Whole JSON replacement and syntax replacement cannot delete hidden links.
- [ ] Submitted inaccessible target links are rejected or stripped before persistence.
- [ ] Targeted link/unlink cannot overwrite or remove a hidden link.
- [ ] Stale sanitized and raw hashes fail safely without exposing the raw hash.
- [ ] External URLs and unrelated node metadata survive allowed operations.

### Verification

- [ ] `pnpm exec vitest run tests/harness-canvas.test.ts tests/collaboration-agents.test.ts tests/mcp-route.test.ts tests/note-links.test.ts`
- [ ] Inspect persisted raw canvas content after every denied mutation and confirm it is byte-for-byte unchanged.
- [ ] Confirm Harness/MCP responses contain no inaccessible note ID or raw content hash.

## Phase 4 — Remove active SVG risk and validate uploaded bytes

### Changes

- [ ] Remove `image/svg+xml` from accepted direct and signed-upload MIME types.
- [ ] Apply sandbox CSP to authenticated attachment responses as defense in depth.
- [ ] Add `Content-Disposition: attachment` for any legacy SVG already stored, or reject legacy SVG content reads if product behavior permits.
- [ ] Add shared raster-image signature validation for PNG, JPEG, GIF, and WebP.
- [ ] Validate actual object byte length, signature-derived type, and configured maximum at signed-upload completion.
- [ ] Validate direct multipart uploads with the same byte-level validator.
- [ ] Compute the completed object content hash from actual bytes.
- [ ] Delete or quarantine mismatched/oversized objects and leave no ready attachment row.
- [ ] Keep `X-Content-Type-Options: nosniff` and private caching behavior.

### Files

- Modify `src/api/routes/attachments.ts`.
- Create `src/api/attachments/image-validation.ts` for reusable byte-signature and size validation.
- Modify `src/api/storage/object-storage.ts` if completion validation needs richer object metadata.
- Modify `src/api/storage/filesystem-storage.ts` and `src/api/storage/s3-storage.ts` if the storage contract changes.
- Modify `tests/attachments.test.ts`.
- Modify `tests/auth-object-access.test.ts`.
- Modify `tests/collaboration-management.test.ts` for a shared-editor upload/read regression.
- Modify `tests/share-links.test.ts` and `tests/folder-share-links.test.ts` to preserve public attachment CSP behavior.

### Verification

- [ ] SVG requests and direct uploads are rejected.
- [ ] Legacy SVG content cannot execute inline under the application/API origin.
- [ ] Spoofed MIME types, oversized actual objects, empty objects, and malformed raster bytes cannot become ready.
- [ ] Valid PNG/JPEG/GIF/WebP direct and signed uploads succeed.
- [ ] Authenticated and public attachment responses contain expected CSP, `nosniff`, cache, and disposition headers.
- [ ] `pnpm exec vitest run tests/attachments.test.ts tests/auth-object-access.test.ts tests/collaboration-management.test.ts tests/share-links.test.ts tests/folder-share-links.test.ts`

## Phase 5 — Privacy-safe DTOs and fail-closed serialization

### Changes

- [ ] Centralize non-owner note and attachment serialization.
- [ ] Remove `updatedByActorId`, raw actor/credential IDs, `userId`, owner IDs, `storageKey`, and hidden canvas counters from non-owner responses.
- [ ] Represent attribution only through existing privacy-safe collaboration identity fields.
- [ ] Ensure signed-upload responses expose only the signed URL, required request headers, public attachment ID/metadata, and Markdown URL.
- [ ] Extend the privacy assertion helper to reject `updatedByActorId`, raw `actorId`, `storageKey`, unexpected non-null `userId`, and hidden-link counters.
- [ ] In Harness search, line-search, recent/orphan, and related post-query serialization, drop any item whose integration access re-resolution returns null.
- [ ] Add a concurrent-revocation regression proving post-query serialization fails closed.

### Files

- Create `src/api/lib/collaboration-serialization.ts`.
- Modify `src/api/notes/listing.ts`.
- Modify `src/api/routes/notes.ts`.
- Modify `src/api/routes/folders.ts`.
- Modify `src/api/routes/attachments.ts`.
- Modify `src/api/routes/harness.ts`.
- Modify `tests/helpers/collaboration-privacy.ts`.
- Modify `tests/collaboration-management.test.ts`.
- Modify `tests/collaboration-agents.test.ts`.
- Modify `tests/note-comments.test.ts`.
- Modify `tests/note-versions.test.ts`.
- Modify `tests/auth-object-access.test.ts`.
- Modify `tests/harness-pagination.test.ts` for fail-closed pagination/serialization behavior.

### Verification

- [ ] Privacy helper passes across shared note, folder, search, recent, comment, version, attachment, and canvas responses.
- [ ] Owner-facing responses retain only intentionally documented owner fields.
- [ ] Revoked access between query and serialization removes the result rather than returning stale metadata.
- [ ] `pnpm exec vitest run tests/collaboration-management.test.ts tests/collaboration-agents.test.ts tests/note-comments.test.ts tests/note-versions.test.ts tests/auth-object-access.test.ts tests/harness-pagination.test.ts`

## Phase 6 — Composite tenant constraints and revocation documentation

### Changes

- [ ] Inventory every derived table containing both tenant and resource identifiers.
- [ ] Add required parent composite unique keys before adding child composite foreign keys.
- [ ] Add tenant-consistent constraints for note versions, comments/threads/messages, tags/note-tags, note links, note/folder shares, and attachments.
- [ ] Add migration preflight checks that fail with actionable counts if existing cross-tenant rows violate the new constraints.
- [ ] Preserve cascade/restrict behavior intentionally for trash, purge, and account deletion.
- [ ] Document next-request revocation semantics, in-flight/download/cache limits, signed-upload URL lifetime, and orphan cleanup expectations.
- [ ] Consider reducing signed-upload expiry from 15 minutes; record the final operational decision.

### Files

- Modify `src/api/db/schema.ts`.
- Create `drizzle/0036_<generated_name>.sql`.
- Create `drizzle/meta/0036_snapshot.json` and update `drizzle/meta/_journal.json` through Drizzle generation.
- Modify `tests/collaboration-schema.test.ts`.
- Modify `tests/permission-schema.test.ts` or create `tests/tenant-constraints.test.ts` if isolation is clearer.
- Modify `tests/migration-runner.test.ts`.
- Modify `tests/trash-notes.test.ts` and `tests/trash-folders.test.ts` for cascade/purge regressions.
- Create `docs/implementation/collaboration-security.md`.
- Modify `docs/README.md` to link the new operational documentation.

### Verification

- [ ] Migration succeeds on a valid pre-migration fixture.
- [ ] Migration fails closed on deliberately cross-tenant fixtures.
- [ ] Database rejects every tested cross-tenant derived-row insertion.
- [ ] Trash, restore, purge, and account lifecycle tests retain intended behavior.
- [ ] `pnpm exec vitest run tests/collaboration-schema.test.ts tests/permission-schema.test.ts tests/tenant-constraints.test.ts tests/migration-runner.test.ts tests/trash-notes.test.ts tests/trash-folders.test.ts`

## Final verification and release gate

- [ ] Run Biome on every changed source, test, migration-adjacent TypeScript, and documentation file: `pnpm exec biome check --write <changed-files>`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run relevant browser collaboration tests: `pnpm exec playwright test tests/browser/collaboration.spec.ts tests/browser/folder-sharing.spec.ts tests/browser/shared-wikilinks.spec.ts`.
- [ ] Run `pnpm build`.
- [ ] Review the final diff for accidental changes to generated SST typings or unrelated files.
- [ ] Re-run adversarial tests independently to rule out parallel-suite flakiness.
- [ ] Do not deploy until all Phase 1–4 checks and the complete test suite pass.

## Approval decisions

Before implementation, approve or change these defaults:

1. **SVG policy:** reject new SVG uploads, sandbox authenticated attachment responses, and force legacy SVG downloads.
2. **Hidden canvas policy:** deny whole-canvas replacement when hidden links exist; deny targeted mutation of hidden links without returning raw hashes/content.
3. **Scope:** implement Phases 1–5 as the release fix; perform Phase 6 tenant constraints in the same release only if migration risk is accepted.
4. **Signed upload validation:** read and validate the completed object bytes once (maximum 10 MiB) for strong type/size/hash verification.
