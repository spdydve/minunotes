# Harness API evaluation plan

## Goals

- Add a Postman Collection v2.1 generated from the harness OpenAPI document, with configurable API URL and `X-API-Key` variables plus useful request examples/scripts for evaluation.
- Reduce discovery/search payloads so agents receive metadata first and explicitly expand a note only through the existing read/lines/section endpoints.
- Preserve useful matched context for information-finding searches without repeating full note metadata in every match.

## Proposed changes

1. **Compact discovery responses**
   - Add response mappers/types for compact folders and notes.
   - Make `GET /v1/harness/notes/search` and `GET /v1/harness/notes/orphans` return compact note metadata, never note content.
   - Make `GET /v1/harness/folders` return only integration-relevant folder metadata (no owner/database fields).
   - Keep explicit `GET /v1/harness/notes/{noteId}`, `/lines`, and `/sections/{sectionId}` as the expansion paths.

2. **Lean line-search responses**
   - Keep line text and requested context for `search-lines` because it is the targeted information-retrieval path.
   - Remove repeated hash/size/line-count fields from each cross-note match; retain note identity and location so the agent can expand the selected note explicitly.
   - Keep single-note line search metadata only where it is useful to follow up safely.

3. **OpenAPI and docs/tests**
   - Update schemas/descriptions to accurately distinguish compact discovery records from full note reads.
   - Add route tests covering absence of `content` and owner-only fields, and line-search compactness.
   - Update the portable API skill/docs with the search-then-expand workflow.

4. **Postman collection**
   - Add a checked-in generated collection artifact covering the OpenAPI harness endpoints, grouped by tags.
   - Add a repeatable generation script that imports the local OpenAPI object and emits the collection, avoiding hand-maintained endpoint drift.
   - Include collection variables for `baseUrl`, `apiKey`, `folderId`, `noteId`, `sectionId`, `nodeId`, `targetNoteId`, `baseHash`, and `shareToken`; include safe example bodies and a minimal smoke-test flow.

## Files expected to change/create

- `src/api/routes/harness.ts`
- `src/api/harness/commands.ts`
- `src/api/openapi/harness.ts`
- `tests/openapi.test.ts` and/or a focused harness response test
- `docs/skills/minunotes-harness-api/SKILL.md`
- `docs/skills/minunotes-harness/SKILL.md` if the portable tool guidance needs parallel wording
- `docs/frontend`/resource documentation only if the public API docs need updating
- `scripts/generate-postman-collection.ts`
- `postman/minunotes-harness.postman_collection.json`
- `package.json` (generation script)
- `plan.md`

## Verification

- Run focused harness/OpenAPI tests, including response-shape assertions.
- Run the Postman generation command and verify the checked-in collection is reproducible and valid JSON.
- Run `pnpm exec biome check --write` on changed source/JSON/TS files.
- Run `pnpm typecheck` and the relevant Vitest tests.

## Implementation status

Approved and implemented.

- [x] Compact folder, note-search, and orphan responses.
- [x] Preserve explicit full-note, line-range, outline, and section expansion paths.
- [x] Remove repeated cross-note line-search hashes, sizes, and line counts while retaining match context.
- [x] Update OpenAPI schemas/descriptions and route regression coverage.
- [x] Update tool-first and curl/API skills.
- [x] Add the generated Postman collection and repeatable `pnpm postman:generate` command.

## Verification record

- Focused Vitest tests pass for note links, harness folder access, and OpenAPI behavior.
- `pnpm typecheck` passes.
- Postman generation completes and emits valid Collection v2.1 JSON.
- Biome changed-file check completed.

# Follow-up plan: paginated retrieval and compact internal lists

## Goal

Prevent large collections from producing unnecessarily expensive agent or application responses while preserving simple retrieval workflows. The harness will use opaque cursor pagination; the authenticated internal API will use conventional page/offset pagination.

## Phase 1 — Cursor pagination for the harness

### Contract

- Add optional `limit` and opaque `cursor` parameters to high-volume harness discovery endpoints.
- Return the existing array fields plus `pageInfo: { hasMore, nextCursor }`; return `nextCursor: null` when exhausted.
- Encode the query, filters, authorization-relevant scope, sort position, and a version marker inside the cursor so cursors cannot be reused for a different search or scope.
- Do not return total counts; they add work and are not needed for agent retrieval.
- Keep compact note/folder/tag metadata and line-search context from the completed work.

### Endpoints

- `GET /v1/harness/folders`
- `GET /v1/harness/tags`
- `GET /v1/harness/notes/search`
- `GET /v1/harness/notes/orphans`
- `GET /v1/harness/notes/search-lines`

Targeted reads (`read note`, `read lines`, `outline`, and `section`) remain explicit expansion operations and do not need collection pagination. Single-note line search can retain its bounded `limit` until a real use case requires paging through one document.

### Implementation checklist

- [x] Add shared cursor encoding/decoding and query-fingerprint validation.
- [x] Apply stable deterministic ordering and fetch one item beyond the requested limit to compute `hasMore`.
- [x] Preserve folder/API-key/OAuth filtering before pagination and never let cursors bypass scope checks.
- [x] Update Hono routes, command helpers, OpenAPI schemas, MCP input schemas/client adapters, Postman examples, and both harness skills.
- [x] Add tests for first page, continuation, exhaustion, invalid/mismatched cursors, query changes, filter changes, and scoped authorization.

### Verification

- Root and MCP focused tests, OpenAPI assertions, cursor reproducibility tests, typecheck, Biome, and Postman generation.

## Phase 2 — Paginated and compact internal API

### Contract

- Add `page` and bounded `limit` parameters to internal list/search endpoints.
- Return existing collection properties for compatibility plus `page`, `limit`, and `hasMore`; do not require expensive total counts initially.
- Introduce compact internal list DTOs that omit full `content` and other fields not needed by list/table/search UI. Keep full note content on explicit note reads.
- Use deterministic ordering with an explicit tie-breaker, such as `updatedAt DESC, id ASC` or `title ASC, id ASC`.

### Backend endpoints to audit and update

- `GET /api/folders`
- `GET /api/folders/:folderId/notes`
- `GET /api/folders/:folderId/templates`
- `GET /api/notes/search`
- `GET /api/notes/recent`
- `GET /api/notes/orphans`
- `GET /api/notes/templates`
- `GET /api/trash` and folder-trash contents where large collections are possible

Also audit tags, backlinks, events, versions, and shared-folder assembly separately; add pagination only where the response can grow materially and the UI or consumer can use it.

### Implementation checklist

- [x] Define shared page/limit parsing and compact list serializers.
- [x] Change database selects to avoid loading full note bodies for list responses where possible.
- [x] Preserve fields required by note actions, folder tables, search dialog, recent notes, templates, and Trash UI.
- [x] Update API client response types and frontend queries/components to consume `hasMore` and navigate or load additional pages.
- [x] Keep explicit note reads and editor navigation behavior unchanged.
- [x] Add regression tests proving list responses omit `content` and page boundaries are correct.

### Verification

- Backend route tests, frontend/browser coverage for folder navigation/search/recent/templates/Trash, typecheck, Biome, and production build.

## Phase 3 — Consumer and documentation rollout

- [x] Update frontend API contracts.
- [x] Update harness/API skills with cursor continuation examples and guidance not to fetch every page blindly.
- [x] Update Postman collection generation with endpoint-specific cursor examples.
- [x] Add a migration/compatibility note for clients that currently assume an unpaginated array.
- [x] Measure response sizes and query behavior before and after on a representative large folder (50 synthetic 10 KB notes: 514,591 bytes full vs 13,077 bytes compact, 97.5% reduction).

## Evaluation notes and intentional exceptions

- Approved for implementation.
- `GET /internal/folders` remains unpaginated because the sidebar, hierarchy validation, destination picker, and inherited privacy/read-only state require a complete tree. Paginating it would create incomplete parent paths and more client requests, not less work.
- Folder-template assignments and trashed-folder contents remain unpaginated because they are relationship/hierarchy payloads; their note records are compact, and selected template bodies now use explicit note reads.
- Tags, backlinks, events, and versions keep their existing bounded or relationship-specific behavior. They should only gain pagination with a corresponding consumer workflow.
- Cross-note line search still has to inspect candidate bodies because the database has no full-text index. The response is bounded and cursor-paginated; adding FTS is a separate storage/indexing project.
- Orphan discovery computes the active graph before slicing pages to preserve correct orphan semantics. It selects compact metadata only; a graph/index redesign would be needed to make this fully keyset-driven.

## Remaining verification

- [x] Full root and MCP test suites.
- [x] Final Biome changed-file pass, typecheck, production build, and reproducible Postman generation.
- [x] Compatibility note and representative response/query measurement.
