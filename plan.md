# Canvas Note Links Plan

Goal: let canvas and mind-map nodes link to internal MinuNotes notes while preserving MinuCanvas external URL behavior and indexing internal links into backlinks and the note graph.

## Decisions

- Keep generic external links in the JSON Canvas `node.url` field and retain MinuCanvas v0.7's built-in external-link behavior.
- Store internal links in host-owned node metadata:
  - `node.minunotes.link.type = 'note'`
  - `node.minunotes.link.id = 'note_…'`
- Allow a node to contain both `url` and `minunotes.link`; internal link/unlink operations must preserve external URLs and unrelated host metadata.
- Type canvas documents as `JsonCanvasDocument<MinuNotesNodeExtra>` so MinuCanvas preserves host metadata.
- Use the MinuCanvas v0.7 imperative `CanvasHandle.updateNode()` API for UI link/unlink changes.
- Use `renderNodeAdornment` for an internal-note badge and `getNodeContextActions` for link, open, change, and unlink actions.
- Open internal links in a new browser tab using the current MinuNotes route; do not persist deployment-specific internal URLs.
- Index valid internal canvas note links in the existing `note_links` table with `linkType = 'canvas-note'`.
- Keep whole-canvas replacement as the canonical persistence operation; add focused harness link/unlink helpers for agents.
- Harness link creation requires edit access to the source canvas and read access to the target note. Linking must not disclose inaccessible note titles.
- Reimplement against current `main` and MinuCanvas v0.7 rather than merging the obsolete `canvas-note-links` commit.

## Files to modify/create

### Frontend canvas integration

- `src/frontend/components/note-canvas-editor.tsx`
  - Add typed MinuNotes node metadata.
  - Hold a typed `CanvasHandle` ref and use `updateNode()` for link/unlink changes.
  - Add internal-note adornment and context actions without changing `node.url` behavior.
  - Add a note picker using the existing internal note search API.
  - Navigate linked notes through TanStack Router.
- `src/frontend/lib/api.ts`
  - Add `canvas-note` to link response types and only add picker/client types if current search types are insufficient.
- `src/frontend/routes/notes.$noteId.tsx`
  - Pass the current note ID to the canvas editor so self-links are excluded from the picker.

### Link indexing and persistence

- `src/shared/canvas-links.ts`
  - Define the shared internal-link metadata types and strict runtime reader.
- `src/api/notes/links.ts`
  - Parse `nodes[].minunotes.link` from valid canvas JSON.
  - Reindex markdown or canvas links according to document type.
  - Resolve canvas targets by stable note ID while ignoring malformed/self links.
- `src/api/db/schema.ts`
  - Add `canvas-note` to the typed `note_links.link_type` enum; no SQL migration is expected because the SQLite column stores text without a database enum constraint.
- `src/api/harness/commands.ts`
  - Reindex canvas links on create, replace, update, and document-type changes.
  - Add focused canvas-node link/unlink commands that preserve all unrelated node fields and metadata.
- `src/api/notes/versions.ts`
  - Reindex restored canvas content rather than clearing its links.

### Harness and public contract

- `src/api/routes/harness.ts`
  - Add link/unlink routes under the current harness prefix.
  - Enforce source edit access, target read access, canvas-only operation, API-editable rules, and optimistic `baseHash` behavior.
- `src/api/openapi/harness.ts`
  - Document link/unlink operations, request schemas, and the `canvas-note` link type.
- `docs/skills/minunotes-harness/SKILL.md`
  - Document canvas-node link metadata and API operations.
- `docs/skills/minunotes-harness-api/SKILL.md`
  - Keep API-only agent guidance aligned with the OpenAPI contract.
- `src/frontend/docs/resources/harness-api.mdx`
  - Add examples for linking and unlinking nodes.
- `src/frontend/docs/resources/wikilinks-backlinks.mdx`
  - Explain that internal canvas links contribute to backlinks and graph results.

### Tests

- `tests/note-links.test.ts`
  - Parse valid metadata and reject malformed links.
  - Index canvas links and expose backlinks/outgoing links.
  - Preserve markdown-link behavior.
  - Reindex after canvas replacement and version restoration.
- `tests/harness-canvas.test.ts`
  - Link, change, and unlink a node.
  - Preserve external `url` and unrelated metadata.
  - Reject missing nodes, missing targets, non-canvas documents, stale hashes, and inaccessible targets.
  - Verify compact harness mutation responses.
- `tests/openapi.test.ts`
  - Verify the new paths and `canvas-note` schema value.
- Relevant browser spec under `tests/browser/`
  - Select a canvas node, link it through search, open it through internal navigation, unlink it, and confirm external URL controls remain available.

## Implementation phases

- [x] Phase 1: Shared metadata and indexing
  - [x] Add typed internal-link metadata and parser.
  - [x] Extend link types and all canvas reindex call sites.
  - [x] Cover parsing, backlinks, replacement, and restoration.
- [x] Phase 2: MinuCanvas v0.7 UI integration
  - [x] Wire typed `CanvasHandle` and `updateNode()`.
  - [x] Add picker, adornment, internal navigation, and context actions.
  - [x] Preserve built-in external links independently from internal note metadata.
- [x] Phase 3: Harness operations and access boundaries
  - [x] Add commands and routes with source/target permission checks.
  - [x] Update OpenAPI and compact response handling.
  - [x] Add permission, hash, preservation, and failure-path tests.
- [x] Phase 4: Documentation and browser coverage
  - [x] Update both harness skills and frontend resources.
  - [x] Add focused browser coverage for link, unlink, internal navigation, and external URL preservation.
- [ ] Phase 5: Verification
  - [x] Run `pnpm exec biome check --write <changed-files>`.
  - [x] Run `pnpm typecheck`.
  - [x] Run targeted note-link, harness-canvas, OpenAPI, and browser tests.
  - [x] Run `pnpm test` and the relevant browser suite.
  - [x] Run `pnpm build`.
  - [x] Verify internal and external links coexist on one node through the end-to-end browser flow.
  - [ ] Optional human smoke check in local development.

## Status

- [x] Scope and data model approved.
- [x] MinuCanvas v0.7 host-extension and imperative APIs reviewed.
- [x] Phase 1 implemented and verified with Biome, typecheck, and targeted note-link tests.
- [x] Phase 2 implemented and verified with Biome and typecheck; targeted indexing tests remain green.
- [x] Phase 3 implemented and verified with Biome, typecheck, and targeted canvas/link/OpenAPI/access tests.
- [x] Phase 4 implemented and verified with Biome, typecheck, and the complete note-editor browser spec.
- [x] Full automated verification passed: 156 unit/integration tests, 14 browser tests, typecheck, and production build.
- [ ] Optional human smoke check remains before merge.

---

# Agent and Bulk Note Move Plan

Goal: let agents and users move one or many notes into a target folder so agent-created notes can be organized inside the existing folder permission model.

## Current baseline
- Internal UI already has single-note move support through `PATCH /internal/notes/:noteId` with `folderId` and `MoveNoteDialog`.
- Harness permissions already support folder-scoped read/create/edit checks through `canIntegrationAccessFolder`.
- Harness does not currently expose a dedicated note move endpoint.
- UI does not currently expose multi-note/bulk move from folder lists.

## Decisions
- Implement a first-class batch move command and route; single-note move is just a one-item batch.
- Keep permissions capability-based, not root-hardcoded:
  - source folder requires `edit` permission.
  - target folder requires `create` permission.
  - private/read-only constraints continue to come from existing folder-access helpers.
  - cross-root moves are allowed only when the actor has permission for both source and target through existing grants.
- Use all-or-nothing behavior for batch moves.
- Limit batch size, initially 100 note IDs.
- Move only regular notes/templates that the caller is permitted to move according to route context:
  - harness should reject templates via existing agent-edit rules unless explicitly extended later.
  - internal UI may move notes the signed-in user owns.
- Keep mutation responses compact for harness: no `content` in moved notes.
- Record move activity/events and pre-agent version checkpoints through existing `updateDocument` behavior.

## Files to modify/create

### API and harness
- `src/api/harness/commands.ts`
  - Add `moveDocuments` / `moveNotes` command using existing `updateDocument` or a transactional batch wrapper.
  - Reuse `updateDocument` move event behavior where possible.
  - Add batch size validation and all-or-nothing preflight.
- `src/api/routes/harness.ts`
  - Add `POST /v1/harness/notes/move` body `{ noteIds: string[], targetFolderId: string }`.
  - Check target `create` permission.
  - Check each source note `edit` permission before moving.
  - Return `{ notes: CompactNote[], targetFolderId }`.
- `src/api/routes/notes.ts`
  - Optional: add internal bulk route `POST /internal/notes/move` for UI reuse, or keep UI batch using repeated single-note PATCH only if simpler.
  - Prefer an internal bulk route for all-or-nothing UI behavior.
- `src/api/openapi/harness.ts`
  - Add request/response schemas and path docs for batch move.

### Frontend UI
- `src/frontend/lib/api.ts`
  - Add `moveNotes(noteIds, targetFolderId)` client method and response types.
- `src/frontend/components/move-note-dialog.tsx`
  - Reuse or generalize for multiple notes if practical.
- `src/frontend/components/move-notes-dialog.tsx` or generalized dialog
  - New bulk move dialog using existing `FolderDestinationPicker`.
- `src/frontend/components/notes-table.tsx`
  - Add multi-select rows and a bulk action bar with “Move”.
  - Invalidate source and target folder note queries after move.
- `src/frontend/routes/folders.$folderId.tsx`
  - Wire selected notes and bulk move dialog into folder note list.

### Docs and skills
- `docs/skills/minunotes-harness-api/SKILL.md`
  - Add `moveNotes`/batch move usage and permission notes.
- `/Users/davidkennedy/.pi/agent/skills/minunotes-harness/SKILL.md`
  - Mirror tool guidance if local skill docs should match deployed harness tools.
- `src/frontend/docs/resources/harness-api.mdx`
  - Add batch move endpoint example.
- Optional: `docs/guides/organizing-notes.md`
  - Add a short note that agents can organize notes by moving them within granted folder access.

### Tests
- `tests/harness-folder-access.test.ts`
  - Add harness move tests:
    - moves one note when source edit + target create are allowed.
    - moves multiple notes all-or-nothing.
    - blocks inaccessible source folder.
    - blocks inaccessible target folder.
    - permits cross-root when both roots are granted.
    - blocks write into agent-read-only folder for all/top-level grants.
    - preserves compact response with no content.
- New or existing internal route tests for `POST /internal/notes/move` if added.
- Browser tests, likely `tests/browser/note-editor.spec.ts` or a new folder-list spec:
  - mocked bulk select + move flow.

## Verification
- `pnpm exec biome check --write <changed files>`
- `pnpm typecheck`
- Targeted tests:
  - `pnpm test tests/harness-folder-access.test.ts`
  - internal move route tests if added
  - relevant browser spec
- Full suite:
  - `pnpm test`
  - `pnpm test:browser`
  - `pnpm build`

## Status
- [x] Approved for implementation.
- [x] API/harness batch move route and command implemented.
- [x] Internal bulk move route and UI bulk move flow implemented.
- [x] OpenAPI, docs, skills, unit tests, and browser tests updated.
- [x] Biome, typecheck, unit tests, browser tests, and build passed.

---

# Read-only Folder Sharing Plan

Goal: add public, read-only folder share links that expose a Drive-like folder landing page with nested subfolders and notes/canvases under the shared folder, without enabling edits, API-key access, or workspace-wide sharing.

## Decisions
- Share links are token-based and read-only, modeled after existing note share links.
- Folder sharing is recursive by default, similar to Google Drive: subfolders and notes added under the shared folder are visible through the share link.
- Shared folder views expose only safe public data: folder titles, note titles, note content/document type, and updated timestamps.
- Shared folder links do not expose folder settings, API access settings, owner metadata, tags, backlinks, activity, versions, or edit controls.
- Folder privacy remains an AI/API access boundary. Owners can explicitly create public read-only share links for folders they own, including private folders.
- Deleting/revoking the link disables access. Regenerating produces a new token and revokes the old active token.
- Existing single-note share links remain unchanged.

## Files to modify/create
- `drizzle/0023_folder_share_links.sql` — add `folder_share_links` table.
- `drizzle/meta/_journal.json` and generated migration metadata — register the new migration.
- `src/api/db/schema.ts` — add `folderShareLinks` table, relations, and exported type.
- `src/api/lib/share-tokens.ts` — add folder share URL builder, likely `/share/folders/:token`.
- `src/api/routes/folders.ts` — add owner endpoints:
  - `GET /internal/folders/:folderId/share-link`
  - `POST /internal/folders/:folderId/share-link`
  - `DELETE /internal/folders/:folderId/share-link`
- `src/api/routes/share.ts` — add public read-only folder endpoint, e.g. `GET /internal/share/folders/:token`.
- `src/frontend/lib/api.ts` — add folder share link types and client methods.
- `src/frontend/components/folder-share-dialog.tsx` — new read-only folder share dialog, mirroring `NoteShareDialog`.
- `src/frontend/components/folder-actions-popover.tsx` — add “Share” action for non-private folders.
- `src/frontend/routes/share.folder.$token.tsx` or equivalent route file — new public shared folder route.
- `src/frontend/router.tsx` — register the shared folder route.
- `tests/folder-share-links.test.ts` — backend coverage for lifecycle, private-folder guardrails, revoke/regenerate, and public access.
- `tests/browser/fixtures.ts` and `tests/browser/note-editor.spec.ts` or new browser spec — mocked browser coverage for folder share dialog and shared folder read-only view.
- Optional docs: `docs/guides/organizing-notes.md` or sharing docs if a user-facing note is needed.

## Implementation phases
- [x] Phase 1: Data model and owner API
  - [x] Add `folder_share_links` migration and schema relations.
  - [x] Implement active-share lookup helpers similar to note share links.
  - [x] Add create/read/revoke folder share endpoints.
  - [x] Enforce: folder exists and owner matches.
  - [x] Tests: create existing link, regenerate, revoke, private folder explicit sharing.

- [x] Phase 2: Public shared folder API
  - [x] Add public token lookup in `shareRoutes`.
  - [x] Return folder metadata, descendant folders, and descendant notes.
  - [x] Exclude templates unless explicitly desired.
  - [x] Enforce revoked/expired share-link checks at read time.
  - [x] Tests: valid recursive public read, revoked 404, explicit private folder sharing, templates hidden.

- [x] Phase 3: Frontend owner UX
  - [x] Add API types/methods in `src/frontend/lib/api.ts`.
  - [x] Build `FolderShareDialog` with copy link, enable read-only link, revoke link, regenerate link.
  - [x] Add Share action to `FolderActionsPopover`.
  - [x] Allow explicit owner sharing for private folders because privacy is scoped to AI/API access.
  - [x] Browser test: enabling/copying folder link uses the expected mocked endpoint.

- [x] Phase 4: Public shared folder view
  - [x] Add `/share/folders/$token` route.
  - [x] Render folder title and nested note/subfolder tree.
  - [x] Selecting a note shows read-only MarkdownEditor or read-only MinuCanvas.
  - [x] No editing, note actions, folder actions, backlinks, tags, API settings, versions, or activity.
  - [x] Browser test: shared folder route loads notes and blocks edit controls.

- [ ] Phase 5: Verification and docs
  - [x] Run Biome on changed files.
  - [x] Run `pnpm typecheck`.
  - [x] Run targeted backend/browser tests.
  - [x] Run full `pnpm test` and `pnpm test:browser`.
  - [x] Run `pnpm build`.
  - [ ] Manual dev check: create link, open incognito, revoke, verify 404.

## Open questions for approval
- Should a shared folder include only direct notes, or direct notes plus subfolders recursively? Decision: recursive, Drive-like folder sharing.
- Should templates be visible if stored in a shared folder? Recommendation: no.
- Should folder share links have optional expiration now? Recommendation: keep schema-compatible with note links but no UI expiration in phase 1.
- Should note-level share links inside a shared folder reuse `/share/:token` links? Decision: no; render notes inside the folder share experience.

---

# MinuNotes Implementation Plan

## Canvas note type plan

Goal: add MinuCanvas as a note-backed tool, not a separate product object. Canvases remain notes with folder, title, tags, details, activity, version history, permissions, and future harness compatibility.

### Decisions
- Use one discriminator: `documentType`.
- Initial values: `markdown`, `canvas.default`, `canvas.mindmap`.
- Existing notes/templates migrate to `markdown`.
- `notes.content` remains the persisted payload:
  - `markdown` stores markdown text.
  - `canvas.*` stores serialized JSON canvas document.
- Start with UI support for `canvas.default`; leave `canvas.mindmap` as schema-ready follow-up unless very small to expose.
- Keep Canvas first as an editor/viewer mode for notes; split view and advanced harness canvas ops are future work.

### Files to modify/create
- `drizzle/0022_note_document_type.sql` — add `notes.document_type`.
- `drizzle/meta/_journal.json` — register migration.
- `src/api/db/schema.ts` — add `documentType` column.
- `src/api/harness/commands.ts` — create/read/update document type support and avoid markdown-only indexing for canvas content.
- `src/api/routes/folders.ts` — allow creating canvas notes.
- `src/api/routes/notes.ts` — allow/save document type where appropriate.
- `src/frontend/lib/api.ts` — add `DocumentType` typing and creation payload.
- `src/frontend/routes/folders.$folderId.tsx` — replace separate New note/from-template buttons with Notion-like New dropdown: Note, Template, Canvas.
- `src/frontend/routes/notes.$noteId.tsx` — render markdown notes with MinuEditor and canvas notes with MinuCanvas.
- `src/frontend/components/note-canvas-editor.tsx` — canvas editor wrapper.
- `src/frontend/styles.css` — import MinuCanvas styles and theme bridge.
- Tests that run migrations — update migration count to include `0022`.
- Add or update tests for canvas-note creation and persistence.

### Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Manual checks:
  - New → Note creates a markdown note.
  - New → Template opens the existing template picker.
  - New → Canvas creates a canvas note and opens the canvas editor.
  - Canvas edits persist after reload.
  - Existing markdown notes still render/edit normally.

## Canvas harness/API update plan

Goal: make canvases first-class for agents without turning them into a separate product object. Canvas documents remain notes with `documentType`, while the harness/OpenAPI gains canvas-aware create/read/replace and syntax-based generation paths.

### Decisions
- Keep JSON Canvas as canonical persisted storage in `notes.content`.
- Prefer Minu diagram syntax for agent-generated diagrams and mind maps.
- Also support direct JSON Canvas manipulation for exact edits/import/export.
- Do not allow markdown patch edits against canvas notes.
- Keep canvas share links disabled for now unless explicitly revisited.
- Use MinuCanvas helpers for defaults and syntax compilation:
  - `createDefaultCanvasDocument()`
  - `createDefaultMindMapDocument()`
  - `compileMinuDiagramSyntax()`
- Initial syntax operations should replace/create whole canvas content, not partial structural edits.

### Proposed harness capabilities
- Read note includes `documentType` and canvas JSON content for canvas notes.
- Create document accepts:
  - `documentType: "markdown" | "canvas.default" | "canvas.mindmap"`
  - optional raw canvas JSON content for canvas documents.
- Replace canvas JSON:
  - validates JSON shape has `nodes` and `edges` arrays.
  - records note version/history and note event.
- Create canvas from Minu diagram syntax:
  - compiles syntax server-side.
  - stores compiled JSON Canvas.
  - supports `layout mindmap` when MinuCanvas compiler/profile supports it.
- Replace existing canvas from Minu diagram syntax:
  - only for `canvas.*` notes.
  - updates title optionally.
- OpenAPI schemas expose document type and canvas/syntax endpoints clearly.

### Files to modify/create
- `src/api/harness/commands.ts` — add canvas validation, create/replace JSON helpers, syntax compile helpers, events/history integration.
- `src/api/routes/harness.ts` — add harness routes/actions for canvas JSON and syntax operations.
- `src/api/openapi/harness.ts` — document new canvas request/response schemas and endpoints.
- `src/api/routes/folders.ts` — ensure raw canvas content creation validates JSON and defaults through MinuCanvas helpers.
- `src/frontend/lib/api.ts` — update types only if frontend needs new fields/endpoints for testing.
- `tests/harness-canvas.test.ts` — new coverage for create/read/replace JSON and syntax-generated canvases.
- `tests/openapi.test.ts` — update expected OpenAPI output if schemas/routes are asserted.
- `docs/skills/minunotes-harness/SKILL.md` — add agent guidance for canvas JSON and diagram syntax.
- `/Users/davidkennedy/.pi/agent/skills/minunotes-harness/SKILL.md` — mirror harness skill update after repo docs are stable.
- `src/frontend/docs/resources/harness-api.mdx` or `agent-integrations.mdx` — add brief canvas harness examples if resources expose harness docs.

### Verification
- `pnpm typecheck`
- `pnpm test tests/harness-canvas.test.ts`
- `pnpm test tests/openapi.test.ts`
- `pnpm test`
- `pnpm build`
- Manual harness smoke:
  - create `canvas.default` from JSON.
  - create `canvas.mindmap` from syntax with a root node.
  - replace a canvas note from syntax.
  - confirm markdown notes still reject canvas-only operations.
  - confirm canvas notes still reject markdown patch edits.

### Implementation phases
- [x] Phase 1: API command primitives
  - [x] Add canvas JSON parser/validator.
  - [x] Add default canvas/mindmap creation through MinuCanvas helpers.
  - [x] Add replace-canvas-content command with version/event integration.
- [x] Phase 2: Harness routes/actions
  - [x] Expose create canvas from raw JSON.
  - [x] Expose replace canvas JSON.
  - [x] Expose create/replace from Minu diagram syntax.
- [x] Phase 3: OpenAPI/tests/docs
  - [x] Add harness canvas tests.
  - [x] Update OpenAPI schemas/tests.
  - [x] Update harness resource docs and skill docs.

## API surface redesign plan

Goal: reshape MinuNotes API routing as if designed from scratch while preserving enough compatibility during the transition. Separate frontend/internal JSON routes from stable external integration routes.

### Target route shape

Internal web-app API, session/cookie based and not documented as stable public API:

```txt
/internal/auth/*
/internal/folders/*
/internal/notes/*
/internal/attachments/*
/internal/api-keys/*
/internal/share/*
/internal/oauth/clients/*
/internal/oauth/authorizations/*
```

External/stable integration API:

```txt
/v1/harness/*
/v1/openapi.json
/openapi.json
/mcp
/mcp/.well-known/oauth-protected-resource
/oauth/*
/.well-known/*
/health
```

The legacy `/api/*` surface is removed; update clients to the canonical routes above.

### Auth model

- `/internal/*`: browser session cookies, except public share JSON.
- `/v1/harness/*`: API key or OAuth bearer.
- `/mcp`: API key or OAuth bearer; OAuth discovery/challenge enabled.
- `/oauth/register`: public DCR with redirect URI guardrails.
- `/oauth/authorize`: browser session because user consent is required.
- `/oauth/token` and `/oauth/revoke`: OAuth protocol requests.
- `/openapi.json` and `/v1/openapi.json`: public read-only specs.

### Decisions

- Make `/internal/*`, `/v1/harness/*`, `/mcp`, `/oauth/*`, and root `/.well-known/*` the preferred/canonical routes.
- Remove `/api/*` legacy aliases.
- Update frontend default API base from `/api` to `/internal`.
- Update external docs/skills to prefer `/v1/harness` and `/mcp`.
- Update OpenAPI paths to `/v1/harness/*` as canonical.
- Keep OAuth unversioned because it is protocol-oriented.
- Keep MCP unversioned because it is protocol-oriented.
- Avoid exposing root `/notes` and `/folders`; those remain internal under `/internal`.

### Files to modify/create

- `src/api/index.ts` — add `/internal`, `/v1/harness`, `/mcp`, `/oauth`, `/openapi.json`, `/v1/openapi.json` canonical routes and middleware; keep `/api/*` aliases.
- `src/frontend/lib/api.ts` — change default `API_URL` to `/internal` and ensure path construction still works.
- `src/api/openapi/harness.ts` — update canonical paths from `/api/harness/*` to `/v1/harness/*`; include server URLs if helpful.
- `src/api/routes/mcp.ts` — update protected-resource metadata/challenges to canonical `/mcp` and `/v1/harness/openapi.json`/`/openapi.json` docs.
- `src/api/middleware/authentication.ts` — update MCP auth challenge detection for `/mcp` and legacy `/api/mcp`.
- Tests:
  - `tests/oauth.test.ts`
  - `tests/mcp-route.test.ts`
  - `tests/openapi.test.ts`
  - any tests that call `/api/harness/*` and should check canonical `/v1/harness/*`.
- Docs/resources:
  - `src/frontend/docs/resources/harness-api.mdx`
  - `src/frontend/docs/resources/agent-integrations.mdx`
  - `src/frontend/docs/resources/mcp.mdx`
  - `src/frontend/docs/resources/oauth-manual-testing.mdx`
  - `docs/skills/minunotes-harness/SKILL.md`
  - `/Users/davidkennedy/.pi/agent/skills/minunotes-harness/SKILL.md`

### Verification

- `pnpm typecheck`
- `pnpm test tests/oauth.test.ts tests/mcp-route.test.ts tests/openapi.test.ts`
- `pnpm test`
- `pnpm build`
- Manual smoke:
  - Frontend can load with `/internal` API base.
  - `GET /openapi.json` and `GET /v1/openapi.json` return canonical `/v1/harness` paths.
  - `GET /v1/harness/folders` works with `X-API-Key` or bearer.
  - `POST /mcp` works with API key or bearer.
  - `GET /mcp/.well-known/oauth-protected-resource` returns canonical resource `/mcp`.
  - `GET /.well-known/oauth-authorization-server` advertises root `/oauth/*` endpoints.
  - Legacy `/api/*` routes return 404 after migration.

### Implementation phases

- [x] Phase 1: Add canonical route aliases and middleware
  - [x] Add `/internal/*` aliases for frontend JSON routes.
  - [x] Add `/v1/harness/*` aliases and OpenAPI endpoints.
  - [x] Add canonical `/mcp` aliases and protected resource metadata.
  - [x] Remove `/api/*` aliases.
- [x] Phase 2: Update frontend and metadata
  - [x] Change frontend default API base to `/internal`.
  - [x] Update OAuth/MCP metadata to canonical routes.
  - [x] Update OpenAPI canonical paths.
- [x] Phase 3: Tests
  - [x] Add canonical route tests.
  - [x] Preserve legacy route tests where useful.
  - [x] Verify OAuth DCR and MCP discovery with canonical routes.
- [x] Phase 4: Docs and skills
  - [x] Update resource docs.
  - [x] Update harness skills and local Pi skill mirror.

## OAuth Dynamic Client Registration Plan

Goal: add Dynamic Client Registration (DCR) for hosted MCP/ChatGPT-style clients while preserving manual OAuth client registration. DCR should reduce setup friction by letting compliant clients register a public OAuth client automatically after discovering MinuNotes OAuth metadata.

### Decisions
- Keep existing manual OAuth Apps/Connected Apps support unchanged.
- Add DCR as an additive public-client registration path.
- DCR clients use the existing `oauth_clients` table.
- DCR-created clients are public clients only; no client secret initially.
- DCR does not require a logged-in MinuNotes user because it registers an application client, not a user authorization.
- User authorization still happens during the existing consent flow.
- Redirect URIs must be HTTPS, except localhost/127.0.0.1 for development.
- Add conservative redirect host guardrails for hosted DCR clients, initially allowing known connector hosts such as `chatgpt.com` plus localhost for dev.
- Advertise `registration_endpoint` in OAuth authorization server metadata.
- Preserve current bearer token support for harness/MCP.

### Files to modify/create
- `src/api/db/schema.ts` — decide whether existing `oauth_clients.userId: null` is enough for DCR-created clients; add any metadata fields only if needed.
- `src/api/routes/oauth.ts` — add `POST /api/oauth/register`, validation, client metadata response, and metadata advertisement.
- `src/api/index.ts` — ensure root OAuth metadata also advertises DCR.
- `src/api/lib/oauth.ts` — add shared redirect URI validation / DCR helpers if route code gets large.
- `tests/oauth.test.ts` — add DCR registration tests and metadata tests.
- `src/frontend/docs/resources/oauth-manual-testing.mdx` — document DCR and manual fallback.
- Optional: `src/frontend/docs/resources/mcp.mdx` or agent integration docs — mention ChatGPT can auto-register if DCR is deployed.

### Verification
- `pnpm typecheck`
- `pnpm test tests/oauth.test.ts tests/mcp-route.test.ts`
- `pnpm test`
- `pnpm build`
- Manual smoke:
  - Fetch `/.well-known/oauth-authorization-server` and confirm `registration_endpoint` is present.
  - `POST /api/oauth/register` with ChatGPT callback URL returns a client ID.
  - Use returned client ID in existing authorize/token flow.
  - Existing manual OAuth client creation still works.
  - MCP protected resource metadata still points to the authorization server.

### Implementation phases
- [x] Phase 1: DCR registration route and metadata
  - [x] Add request/response validation.
  - [x] Insert public OAuth client with `userId: null`.
  - [x] Advertise `registration_endpoint` in `/api/oauth/.well-known/oauth-authorization-server` and root metadata.
- [x] Phase 2: Tests
  - [x] Test successful public-client DCR registration.
  - [x] Test rejected insecure/unsupported redirect URIs.
  - [x] Test metadata includes registration endpoint.
  - [x] Test existing manual OAuth client route still works.
- [x] Phase 3: Docs
  - [x] Document ChatGPT/MCP DCR setup.
  - [x] Document manual OAuth client fallback.

## OAuth Integrations Plan

## Why we are doing this

OAuth gives MinuNotes a safer and more standard way to connect hosted third-party tools, especially ChatGPT/MCP clients, without asking users to copy long-lived API keys into external products.

API keys remain the right fit for local/private agents, scripts, CI, and trusted developer workflows. OAuth is for user-authorized connected apps.

## Benefits

- **User-controlled consent**: users can approve a connection from the MinuNotes UI instead of manually copying secrets.
- **Scoped access**: OAuth grants should use the same current permission model as API keys: all non-private folders, selected project roots, or specific folders, with read/create/edit permissions and optional folder creation.
- **Revocation UX**: users can disconnect an app from settings without hunting down copied keys.
- **Short-lived access tokens**: access tokens can expire and be refreshed, reducing risk compared with permanent API keys.
- **Third-party compatibility**: OAuth is expected by many hosted integrations, including ChatGPT-style connectors and MCP clients using bearer auth.
- **Cleaner security boundary**: API keys stay for owner-managed automation; OAuth becomes the public connected-app flow.
- **Future marketplace/readiness**: OAuth metadata, consent, revoke, and bearer auth are foundational for official integrations later.

## Non-goals

- Do not remove API keys.
- Do not make OAuth the primary path for local agents.
- Do not add broad account federation/social login in this work.
- Do not implement a full public developer-app marketplace in the first pass.
- Do not bypass existing folder privacy/read-only/API-editability rules.

## Current integration model

MinuNotes currently supports:

- Harness API with `X-API-Key`.
- Hosted MCP at `/api/mcp` using API-key auth.
- Local MCP using API-key auth.
- OpenAPI/tool importers using API-key auth.
- Skills/docs that instruct agents to use API keys safely.

OAuth should add a second auth mechanism for hosted connected apps:

```http
Authorization: Bearer <access_token>
```

The existing API key path should continue unchanged.

## Proposed architecture

- Add first-class OAuth clients, authorizations, codes, tokens, and folder permissions.
- Use Authorization Code + PKCE first.
- Use opaque DB-backed access/refresh tokens first.
- Reuse the existing API-key folder access model exactly where possible.
- OAuth authorizations should support the same access modes as API keys:
  - all non-private folders
  - selected project roots and their non-private descendants
  - specific folders
- OAuth authorizations should support the same permission flags as API keys:
  - read
  - create notes
  - edit notes
  - create folders
- OAuth authorizations should respect the same folder-level rules:
  - private folders are never exposed
  - private parent folders make descendants inaccessible
  - folder-level “read-only for agents” blocks create/edit for all/project-root grants
  - explicit specific-folder grants can act as intentional write exceptions if we choose to mirror API-key behavior exactly
- Introduce an integration actor abstraction that can represent either:
  - API key actor
  - OAuth authorization actor
  - normal user/session actor
- Add bearer auth support to `/api/harness/*` and `/api/mcp` after shared actor permissions are ready.
- Keep ChatGPT as a static/preconfigured OAuth client during early development.

## Proposed data model

New tables likely needed:

### `oauth_clients`
- `id`
- `name`
- `description`
- `redirect_uris` JSON/text
- `client_type` — `public` or `confidential`
- `client_secret_hash` nullable
- `created_at`
- `updated_at`
- `revoked_at`

### `oauth_authorizations`
- `id`
- `user_id`
- `client_id`
- `scope`
- `access_mode` — mirror API keys: `all`, `top_level`, or `specific`
- `can_read`
- `can_create`
- `can_edit`
- `can_create_folders`
- `created_at`
- `updated_at`
- `revoked_at`
- `last_used_at`

### `oauth_authorization_folder_permissions`
- `id`
- `authorization_id`
- `folder_id`
- `can_read`
- `can_create`
- `can_edit`
- `created_at`
- `updated_at`

### `oauth_authorization_codes`
- `id`
- `code_hash`
- `client_id`
- `user_id`
- `redirect_uri`
- `scope`
- `code_challenge`
- `code_challenge_method`
- `authorization_id`
- `expires_at`
- `used_at`
- `created_at`

### `oauth_tokens`
- `id`
- `authorization_id`
- `access_token_hash`
- `refresh_token_hash`
- `scope`
- `access_token_expires_at`
- `refresh_token_expires_at`
- `revoked_at`
- `created_at`
- `updated_at`

## Files likely to modify/create

### API/auth core
- `src/api/db/schema.ts`
- new migration under `drizzle/`
- `src/api/index.ts`
- `src/api/middleware/authentication.ts`
- new `src/api/lib/oauth.ts`
- new `src/api/routes/oauth.ts`
- new `src/api/lib/integration-actors.ts`

### Harness/MCP integration
- `src/api/routes/mcp.ts`
- `src/api/routes/harness.ts`
- `src/api/harness/commands.ts`
- `src/api/lib/folder-access.ts`
- permission helpers that currently assume `apiKey` only

### Frontend/settings UX
- `src/frontend/routes/settings.api-access.tsx`
- connected apps UI, possibly folded into API Access initially
- OAuth consent route/page:
  - `src/frontend/routes/oauth.authorize.tsx`

### Docs/resources
- `src/frontend/docs/resources/agent-integrations.mdx`
- `src/frontend/docs/resources/mcp.mdx`
- `src/frontend/docs/resources/openapi.mdx`
- possible new `src/frontend/docs/resources/oauth.mdx`
- `docs/skills/minunotes-harness/SKILL.md` only if OAuth changes agent setup guidance

### Tests
- new `tests/oauth.test.ts`
- update `tests/mcp-route.test.ts`
- update harness/folder permission tests if actor abstraction changes

## Implementation phases

### Phase 1: OAuth foundations, no public UI polish
- [x] Add OAuth schema and migration.
- [x] Add OAuth token hashing/generation helpers.
- [x] Add Authorization Code + PKCE route skeleton.
- [x] Add token exchange route.
- [x] Add revoke route.
- [x] Add discovery metadata endpoints.
- [x] Add tests for PKCE validation, redirect URI validation, token issuance, token revocation.

### Phase 2: Shared integration actor permissions
- [x] Introduce shared actor resolution for API key and OAuth bearer tokens.
- [x] Keep existing `X-API-Key` behavior working.
- [x] Add `Authorization: Bearer <token>` support for harness and hosted MCP.
- [x] Update folder/note permission checks to work with OAuth authorization permissions.
- [x] Mirror current API-key access modes: all non-private, project roots, and specific folders.
- [x] Mirror current API-key permission flags: read, create, edit, and create folders.
- [x] Mirror current folder privacy/read-only behavior, including project-root descendants and specific-folder exceptions.
- [x] Add tests proving API key and OAuth actor permissions match.

### Phase 3: Consent and connected app management
- [x] Add OAuth consent UI for selecting folder permissions and folder creation capability.
- [x] Add connected apps list in settings (currently hidden behind `VITE_ENABLE_OAUTH_APPS=true` while OAuth is tested).
- [x] Add revoke connected app action.
- [x] Add tests for consent creation and revocation.

### Phase 4: ChatGPT/MCP compatibility
- [ ] Verify ChatGPT connector OAuth expectations and metadata endpoints.
- [ ] Add CORS/OPTIONS behavior needed by ChatGPT for `/api/mcp`.
- [ ] Ensure `/api/mcp` supports Bearer tokens.
- [ ] Add resource/docs page for ChatGPT connector setup.
- [ ] Test with MCP Inspector using Bearer auth if supported.
- [ ] Test with ChatGPT developer-mode connector.

### Phase 5: Hardening
- [ ] Add refresh token rotation if not included earlier.
- [ ] Add rate limits specific to OAuth token/authorize endpoints.
- [ ] Add audit events for connect/revoke/token use if desired.
- [ ] Add admin/developer client registration UX or static seeded clients.
- [ ] Review OpenAPI security definitions for Bearer token support.

## Cleanup / follow-up before broad release

- [ ] Decide whether OAuth app creation should remain user-facing or become admin/preconfigured-only.
- [ ] Keep `VITE_ENABLE_OAUTH_APPS` off in production until ChatGPT/MCP compatibility is validated.
- [ ] Revisit OAuth resources/docs visibility before broad release.
- [ ] Review and simplify OAuth app presets after real connector testing.

## Open questions

- Should OAuth clients be manually registered by the MinuNotes owner, or should users create OAuth apps in settings?
- Should ChatGPT be a first-party predefined OAuth client or a user-created client?
- Does ChatGPT Apps SDK require OAuth discovery at root `/.well-known/*`, `/api/.well-known/*`, or both?
- Does ChatGPT require Dynamic Client Registration for submitted apps, or is static client registration enough?
- Should OAuth access tokens be opaque DB-backed tokens initially, or signed JWTs?
- How should refresh token rotation be handled in the first implementation?
- Should OAuth authorizations internally create hidden API keys, or should they use first-class OAuth permission tables?
- Should OAuth mirror API-key specific-folder write exceptions exactly, or should connected apps use stricter read-only inheritance?

## Recommended initial decisions

- Use opaque DB-backed tokens first.
- Use first-class OAuth permission tables rather than hidden API keys.
- Mirror the current API-key permission model unless there is a clear security reason to diverge.
- Support Authorization Code + PKCE only at first.
- Treat ChatGPT as a static configured OAuth client during early development.
- Keep API keys indefinitely for local/private agents and MCP clients.
- Add Bearer support to `/api/harness/*` and `/api/mcp` only after shared actor permissions are ready.

## Verification plan

- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [x] OAuth unit/integration tests pass.
- [x] Existing API key harness tests pass unchanged.
- [x] OAuth permission tests cover all non-private, project-root, specific-folder, private-folder, and read-only-folder behavior.
- [x] Existing hosted MCP tests pass with `X-API-Key`.
- [x] New hosted MCP tests pass with `Authorization: Bearer`.
- [ ] Manual ChatGPT connector smoke test after Phase 4.

## Approval

Planning only. Do not implement until this plan is approved and phase scope is selected.

---

# Auth Surface Cleanup Plan

## Goal

Make direct harness API access and hosted MCP access work cleanly side-by-side without auth-mode ambiguity, with API keys reserved for direct API automation and OAuth Bearer reserved for MCP/hosted connected apps.

## Decisions to preserve

- Direct `/v1/harness/*` API access uses API keys only.
- Hosted integrations such as ChatGPT use OAuth Bearer tokens through `/mcp` only.
- MCP uses OAuth Bearer as the primary hosted auth mode.
- Optional/local MCP API-key support can remain if useful, but should be clearly separate from hosted OAuth.
- `Authorization: Bearer` should mean OAuth only.
- API keys should use `X-API-Key` for direct harness requests.

## Files to modify/create

- `src/api/middleware/authentication.ts`
  - Introduce a first-class auth context variable, e.g. `authActor` or `authContext`.
  - Capture `type: "apiKey" | "oauth" | "session" | "anonymous"` plus safe IDs.
  - Add low-noise structured logs for MCP/harness auth mode without token values.
- `src/api/lib/api-keys.ts`
  - Stop treating `Authorization: Bearer` as an API key.
  - Keep API-key parsing/verification focused on `X-API-Key`.
  - If needed, add explicit legacy helper only for local compatibility and do not use it in hosted OAuth paths.
- `src/api/routes/mcp.ts`
  - Use the explicit auth context to decide whether to forward `X-API-Key` or `Authorization: Bearer`.
  - Update any remaining wording/errors to say “authorized connection” unless the failure is specifically an API-key failure.
- `src/api/routes/harness.ts`
  - Ensure route-level 401s are generic unless authentication middleware identified a concrete invalid API key/bearer.
- `packages/mcp/src/server.ts`
  - Keep OAuth/API-key neutral tool descriptions.
- Tests:
  - `tests/mcp-route.test.ts`
  - `tests/harness-folder-access.test.ts`
  - `tests/auth-object-access.test.ts`
  - Add/extend tests for header semantics and auth forwarding.

## Proposed implementation phases

- [x] Phase 1: Explicit auth context
  - [x] Add `authContext` variable to Hono context.
  - [x] Set `authContext.type = "apiKey"` only for valid `X-API-Key`.
  - [x] Set `authContext.type = "oauth"` only for valid `Authorization: Bearer`.
  - [x] Set session/anonymous context for internal/browser routes.

- [x] Phase 2: Header semantics cleanup
  - [x] Update API-key helpers to no longer parse bearer tokens as API keys.
  - [x] Keep direct harness API usage documented as `X-API-Key` only.
  - [x] Ensure invalid API-key messages only occur for actual `X-API-Key` attempts.

- [x] Phase 3: MCP forwarding and diagnostics
  - [x] Update MCP to route based on `authContext.type`/OAuth auth state.
  - [x] Add structured logs: route, auth type, safe auth id, status, no secrets.
  - [x] Verify ChatGPT OAuth goes through `oauth` mode at `/mcp`, not `apiKey` mode.

- [x] Phase 4: Tests and docs
  - [x] Add tests proving API key direct API access still works.
  - [x] Add tests proving OAuth direct harness API access is rejected unless explicitly re-enabled.
  - [x] Add tests proving hosted MCP uses OAuth bearer.
  - [x] Remove hosted MCP API-key forwarding; local stdio MCP remains API-key based.
  - [x] Update docs/resources if user-facing instructions changed.

## Verification

- `pnpm typecheck`
- `pnpm test tests/mcp-route.test.ts tests/oauth.test.ts tests/harness-folder-access.test.ts tests/auth-object-access.test.ts`
- `pnpm test`
- `pnpm build`
- Production smoke:
  - `GET /v1/harness/folders` with `X-API-Key` succeeds.
  - `GET /v1/harness/folders` with OAuth bearer is rejected.
  - ChatGPT MCP can list/create folders and create notes through OAuth bearer.
  - Invalid API key returns “Invalid API key”.
  - Invalid OAuth bearer returns “Invalid bearer token”.

## Approval

Planning only. Do not implement until approved.

---

# Stable Wikilinks and Browser Integration Tests Plan

## Scope and decisions

Deliver the two agreed immediate priorities before shared-workspace editing:

1. New wikilinks inserted from MinuNotes suggestions use stable note-ID targets with a human-readable alias: `[[note_id|Note Title]]`.
2. Existing title-only links remain valid and are never rewritten automatically. Ambiguous legacy links must be surfaced for an explicit user repair choice; the implementation must not guess a target.
3. Establish browser-level integration coverage in MinuNotes for the app wiring around the editor and canvas. Package-level MinuEditor/MinuCanvas tests remain their responsibility.

**Decision proposed for approval:** use ID-backed targets for **all app-inserted wikilink suggestions**, not only duplicate-title cases. This makes future renames and later title collisions safe by default while keeping Markdown readable through aliases.

## Phase 1 — Stable wikilink insertion and legacy safety

- [x] Update the `wikiLinks.suggest` integration in `src/frontend/routes/notes.$noteId.tsx` so every note suggestion inserts `note.id|note.title` as its target, while retaining the current title and folder as suggestion display metadata.
- [x] Confirm `findNote`, `resolve`, and `onOpen` continue to resolve ID-backed targets and navigate correctly after target-note rename/move.
- [x] Extend `tests/note-links.test.ts` to cover ID-backed links with aliases, renamed targets, duplicate titles, and the invariant that ambiguous title-only links remain unresolved.
- [x] Add a safe legacy-link repair design: detect ambiguous title-only links without mutation and offer only explicit conversion to a user-selected ID-backed target. Do not add an automatic database/content migration.
- [x] Update `docs/guides/markdown-editor.md` and `docs/implementation/minueditor-wikilinks.md` to explain stable targets, aliases, duplicate-title behavior, and the legacy-link repair rule.

### Files expected to change

- `src/frontend/routes/notes.$noteId.tsx`
- `tests/note-links.test.ts`
- `docs/guides/markdown-editor.md`
- `docs/implementation/minueditor-wikilinks.md`
- Possibly `src/api/notes/links.ts` and `src/api/routes/notes.ts` only if legacy-link ambiguity detection needs a dedicated shared API; no schema migration is expected.

### Verification

- Existing unique and ID-backed wikilinks open the correct note.
- New app-selected wikilinks remain valid when the target is renamed.
- New app-selected wikilinks resolve correctly when another note has the same title.
- Legacy title-only duplicates are unresolved rather than silently linked to an arbitrary note.
- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck`
- `pnpm test tests/note-links.test.ts`
- `pnpm test`
- `pnpm build`

## Phase 2 — Browser integration-test baseline

- [x] Choose and configure a real-browser runner compatible with the Vite app (Playwright is the default recommendation); add an isolated browser fixture with mocked authenticated API responses.
- [x] Add reusable browser helpers for deterministic note/folder fixtures and autosave assertions without arbitrary sleeps.
- [ ] Add initial app-level editor cases:
  - [x] edit title/content and verify autosave survives reload;
  - [x] insert/select an ID-backed wikilink and verify navigation;
  - [x] use a slash command and verify Markdown persistence;
  - [x] insert an external image through the app image picker;
  - [x] cover the app-owned attachment upload path, including an upload failure state;
  - [ ] verify the stale-state UI after an out-of-band API edit (defer until stale polling is testable without timer manipulation, or is replaced with push-based freshness).
- [x] Add an initial canvas case: edit a canvas note, reload, and verify persisted content.
- [x] Add CI-friendly scripts separating fast API/unit tests from browser integration tests; browser tests are not folded into the current unit-test command.

### Files expected to change/create

- `package.json`
- `pnpm-lock.yaml`
- Browser-runner configuration (for example `playwright.config.ts`)
- Test setup/fixture helpers under a new `tests/browser/` directory
- Browser specs under `tests/browser/`
- Possibly `vite.config.ts` or a dedicated test server script to run the frontend against the local API

### Verification

- The browser suite runs from a clean local database with no production credentials.
- Each initial scenario passes independently and in the full suite.
- Existing API/unit test behavior remains unchanged.
- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck`
- `pnpm test`
- Browser test command
- `pnpm build`

## Approval

Planning only. Do not implement until approved.

---

# MCP Harness Parity Plan

## Goal

Expose the approved MinuNotes harness capabilities through both local stdio MCP and hosted OAuth MCP while keeping permissions, responses, and concurrency behavior delegated to the existing harness routes.

## Approved scope

### Canvas lifecycle

- Create a canvas from JSON Canvas.
- Create a canvas from Minu diagram syntax.
- Replace a canvas from JSON Canvas.
- Replace a canvas from Minu diagram syntax.

### Canvas note links

- Set or update one canvas node’s internal note link.
- Remove one canvas node’s internal note link.

### Structured note reads

- Read a markdown note outline so agents can discover section IDs.
- Read note activity events.

### Tags

- List visible tags.
- Read tags for one note.
- Replace all tags on one note.

## Deferred scope

- Outgoing-link inspection.
- Backlink inspection through MCP.
- Orphan-note discovery through MCP.
- Broader graph traversal.
- New graph UI.
- Canvas note-link picker polish.
- New harness routes or database changes.

Deferred graph product and MCP work is documented in MinuNotes note `note_51ffff69de0349369b660b3dd3120a43`.

## Decisions

- Reuse the existing `/v1/harness` routes; MCP remains an adapter rather than a second domain implementation.
- Keep local API-key MCP and hosted OAuth MCP clients behaviorally aligned.
- Require `baseHash` for canvas replacement and node-link mutations even where the REST route can technically accept an omitted hash.
- Treat link set as an upsert: the same tool creates or changes the node’s internal target.
- Preserve existing harness permission behavior, including source edit access, target read access, and inaccessible-target redaction.
- Describe Minu syntax as whole-document generation. Syntax replacement can regenerate node IDs, layout, and metadata; use focused link tools afterward and use JSON Canvas when exact metadata preservation is required.
- Do not expose graph operations through MCP until their UI/product semantics are designed.

## Proposed MCP tools

- `notes_create_canvas`
- `notes_create_canvas_from_syntax`
- `notes_replace_canvas`
- `notes_replace_canvas_from_syntax`
- `notes_set_canvas_node_note_link`
- `notes_remove_canvas_node_note_link`
- `notes_read_outline`
- `notes_read_events`
- `notes_list_tags`
- `notes_read_note_tags`
- `notes_replace_note_tags`

## Files to modify

- `packages/mcp/src/server.ts`
  - Extend `NotesMcpClient`.
  - Add schemas, descriptions, annotations, and handlers for the approved tools.
- `packages/mcp/src/config.ts`
  - Add local API-key client adapters for each existing harness route.
- `src/api/routes/mcp.ts`
  - Add matching hosted OAuth client adapters.
- `packages/mcp/tests/server.test.ts`
  - Verify registration, schemas/annotations, and handler delegation.
- `packages/mcp/tests/config.test.ts`
  - Verify local client HTTP methods, paths, query parameters, and payloads.
- `tests/mcp-route.test.ts`
  - Verify hosted MCP permissions and representative read/write workflows.
- `packages/mcp/README.md`
  - Document the new tool inventory and safe canvas syntax guidance.
- `src/frontend/docs/resources/mcp.mdx`
  - Document the expanded MCP capabilities and deferred graph scope.
- `src/frontend/docs/resources/agent-integrations.mdx`
  - Update capability summaries if its current inventory is explicit.

## Implementation phases

### Phase 1 — Shared MCP contracts and tools ✅

- [x] Extend `NotesMcpClient` with canvas, outline, events, and tag methods.
- [x] Register all approved tools with focused Zod inputs.
- [x] Mark read tools read-only/idempotent.
- [x] Mark replacements and tag/link mutations destructive where they can overwrite current state.

Verification:

- [x] Run MCP server registration tests: 13 passed.
- [x] Confirm tool names and annotations are stable.

Phase note: `NotesMcpClient` now requires the new methods. Local and hosted adapters intentionally remain incomplete until Phase 2, so full package type/build verification is deferred to that phase.

### Phase 2 — Local and hosted adapters ✅

- [x] Implement matching route calls in `packages/mcp/src/config.ts`.
- [x] Implement matching in-process harness calls in `src/api/routes/mcp.ts`.
- [x] Keep payload shapes identical between transports.
- [x] Encode note/node IDs and query parameters safely.

Verification:

- [x] Run the complete MCP package suite: 23 tests passed.
- [x] Run hosted MCP route and canvas harness tests: 13 tests passed.
- [x] Verify hosted OAuth read calls and write permission errors through Streamable HTTP.
- [x] Verify stale hash, target visibility, and canvas link permission behavior through harness canvas coverage.
- [x] Run `pnpm typecheck`.

### Phase 3 — Documentation and package verification ✅

- [x] Document JSON Canvas versus Minu syntax use cases.
- [x] Warn that syntax replacement is whole-document replacement and may regenerate IDs/metadata.
- [x] Document link set/update and remove behavior.
- [x] Document outline/events/tags tools.
- [x] Keep deferred graph operations out of the advertised MCP inventory.

Verification:

- [x] Build the MCP package.
- [x] Export the MCP release package.
- [x] Run `npm pack --dry-run`: 14 files, 10.8 kB package, 53.6 kB unpacked.

### Phase 4 — Full verification ✅

- [x] Run Biome on changed TypeScript files.
- [x] Run `pnpm --filter @minunotes/mcp test`: 23 tests passed.
- [x] Run `pnpm --filter @minunotes/mcp build`.
- [x] Run targeted MCP route and affected harness tests: 25 tests passed.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`: 165 tests passed across 24 files.
- [x] Run `pnpm build`.
- [x] Review `git diff --check` and confirm the working tree contains only intended changes.
- [x] Update the MinuNotes `Unreleased` changelog entry.

Build note: the existing large-chunk warning remains; this work does not add frontend runtime dependencies.

### Phase 5 — Pi skill and direct harness tools ✅

- [x] Add focused Pi tools for setting/changing and removing canvas-node note links.
- [x] Require `baseHash` and preserve the existing harness route semantics.
- [x] Update the repository and installed Pi harness skills with focused link workflows and syntax-replacement guidance.
- [x] Validate the extension loads through Pi and run Biome on the installed extension.

Phase note: Pi extension validation passed. Biome reported four pre-existing warnings in the installed extension (`any` and `{}` types) and no errors.

## Acceptance criteria

- [x] Every approved tool works through local stdio MCP and hosted OAuth MCP.
- [x] Existing harness authorization and conflict responses are preserved.
- [x] Canvas syntax and JSON behavior are clearly distinguished.
- [x] Link set/update and remove preserve external URLs through the existing focused harness operations.
- [x] Outline makes existing section reads discoverable.
- [x] Events and tags match existing UI/harness behavior.
- [x] No graph MCP tools are introduced in this phase.

# Shared-View Wikilink Rendering

Goal: render `[[X]]` wikilinks in the shared-note view the same way the editor does, without switching the shared view to CodeMirror. Keep the shared view on `MarkdownRenderer` so it stays lightweight and semantic. Editor-side quirks (raw `1.`/`2.`, CM6 code-block highlighter, editable table widget) are out of scope per the user — those wait for editable shared notes.

## Decisions

- Of the six renderer-vs-editor mismatches previously enumerated, only **wikilinks** is a renderer-side gap. The other five are editor behavior, not renderer defects. Address wikilinks only.
- Keep `MarkdownRenderer` in the shared view. Do not switch to `MarkdownEditor` (perf, a11y, and folder-list cost are not worth it for read-only sharing today).
- Render shared-view wikilinks as `me-wikilink me-wikilink--unknown` (dotted underline, link color). No `resolve` is possible without a public API, and that work is deferred.
- Support both `[[X]]` and `[[X|Y]]` (alias). The label is the visible text; the target stays in the DOM for later resolution.
- Implement via a small wrapper component that wraps `MarkdownRenderer` and post-processes the rendered DOM. No new dependencies, no fork, no patch.
- Skip wikilink decoration inside `<pre>`, `<code>`, `<a>`, `<script>`, and `<style>` to avoid touching code blocks and existing links.

## Files to create

- `src/frontend/components/shared-markdown-renderer.tsx`
  - Default export `SharedMarkdownRenderer` with the same prop shape as `MarkdownRenderer` (`value`, `codeHighlighter`, `className`).
  - Internally renders `<MarkdownRenderer … />` inside a wrapper `<div>` with a ref.
  - `useEffect` on `[value, codeHighlighter]`: walk text nodes in the renderer child, replace `[[X]]` / `[[X|Y]]` matches with `<a class="me-wikilink me-wikilink--unknown" data-wikilink-target="X">label</a>`.
  - Reuse existing `me-wikilink` / `me-wikilink--unknown` classes from `@dpklabs/minueditor/theme.css` (already imported in `src/frontend/styles.css`) so no new CSS is needed.

## Files to modify

- `src/frontend/routes/share.$token.tsx`
  - Swap `import { MarkdownRenderer } from '@dpklabs/minueditor'` for `import { SharedMarkdownRenderer } from '../components/shared-markdown-renderer'`.
  - Swap the `<MarkdownRenderer … />` JSX for `<SharedMarkdownRenderer … />`.
- `src/frontend/routes/share.folders.$token.tsx`
  - Same import + JSX swap as above.

## Verification

- Manual: open a shared note containing `[[Some Note]]` and `[[note_abc|Custom label]]`. Verify both render as styled anchors (dotted underline) with the label text. Verify `[[X]]` inside a fenced code block is left alone.
- Manual: open a shared folder, confirm multiple notes still render quickly (no CM6 mount cost).
- `pnpm typecheck`.
- `pnpm exec biome check --write src/frontend/components/shared-markdown-renderer.tsx src/frontend/routes/share.$token.tsx src/frontend/routes/share.folders.$token.tsx`.
- Optional: add a `tests/browser/shared-wikilink.spec.ts` Playwright test that loads a shared note fixture with `[[X]]` and asserts the `.me-wikilink` element exists with the expected text and `data-wikilink-target` attribute.

## Acceptance criteria

- [ ] `[[X]]` and `[[X|Y]]` render as `.me-wikilink.me-wikilink--unknown` in both single-note and folder shared views.
- [ ] Code blocks, existing links, and inline code are untouched by the decoration pass.
- [ ] `MarkdownRenderer` remains the rendering engine — no CM6 in the shared view.
- [ ] No new runtime dependencies; no public API changes.

# Shared-View Wikilink Resolver

Goal: in shared-note and shared-folder views, resolve `[[X]]` wikilinks to clickable links that navigate to the target's own shared view — but only when the target is reachable from the current share context. This is the security-sensitive follow-up to the rendering-only change above. Today, wikilinks render styled but go nowhere on click.

## Security model (the rule)

A target is **reachable** from the current share context iff one of the following holds:

1. The target is the **currently-shared note** (self-link edge case — the resolver returns the same share token).
2. The target has its own **active `note_share_links` entry** (not revoked, not expired).
3. The target lives in a folder that the current share context **grants access to** — meaning the current share token is a folder share for an ancestor (or the note's own folder), or the current note-share is in a folder that has an active `folder_share_links` entry.

If none of the above hold → the resolver returns `shareToken: null`. The frontend renders the wikilink as a "not available" placeholder. No `href` is constructed. No leak path exists.

The resolver's response is intentionally narrow — `{ target, shareToken }`. It must never return the note's `/notes/<id>` URL, its title, folder, owner, or any other metadata. The label is taken from the markdown source by the frontend.

## API contract

`POST /internal/share/resolve`

Request:
```json
{
  "token": "<current share token>",
  "targets": ["Some Note", "note_abc123", "https://notes.dpklabs.com/notes/note_xyz"]
}
```

Response:
```json
{
  "resolutions": [
    { "target": "Some Note", "shareToken": "shr_…" },
    { "target": "note_abc123", "shareToken": null },
    { "target": "https://notes.dpklabs.com/notes/note_xyz", "shareToken": null }
  ]
}
```

Notes:
- `token` is the share token from the URL the viewer is currently on. The resolver uses it to determine the share context (note or folder share).
- `targets` is the de-duplicated list of wikilink target strings found in the rendered note. Order is preserved in the response.
- `shareToken` is the *target's* share token, not the viewer's. Use it to construct `/share/<shareToken>` links.
- A target may match a note by ID or by title; resolution checks reachability, not just existence.

## Authz lookup strategy

For each unique target:
1. If the target matches the `note_<id>` pattern, look up the note by ID.
2. Otherwise, look up the note by exact title match (single result required; if multiple notes share a title, return null).
3. If no note is found, return `shareToken: null`.
4. If a note is found, run the reachability check:
   - Self-link → return the current share token.
   - Note has its own active `note_share_links` entry → return that token.
   - Current share is a folder share, target is in the shared folder (or a sub-folder) → return the folder share token.
   - Current share is a note share, the current note and the target are in the same folder, and that folder has an active `folder_share_links` entry → return the folder share token.
   - Otherwise → `shareToken: null`.

Batched: one query for all candidate notes, one query for active note-share rows, one query for active folder-share rows, one query for the current share's context. Four queries total, regardless of target count.

## Rate limiting and abuse prevention

- Per-IP, per-token bucket: 60 requests/minute, 1000 requests/hour. Return `429` over the limit.
- `targets` array capped at 500 entries per request.
- Each target string capped at 256 chars.
- Reject requests with malformed tokens before any DB work.

## Caching and invalidation

- Cache resolutions per `(shareToken, sortedTargetsHash)` for the lifetime of the share token.
- TTL: 5 minutes (defense in depth; the underlying share token's own expiry is the real bound).
- Cache invalidation: when a `note_share_links` or `folder_share_links` row is revoked or expires, evict all cache entries that include the affected share token *or* any share token that could have resolved through it (the latter is approximated by evicting all entries for the affected user).
- Cache storage: in-memory LRU keyed by share token, since share tokens are already secret. Not persistent.

## Audit logging

- Log every resolver call: timestamp, share token (truncated), target count, number of resolutions returned, source IP.
- No target strings or share tokens in full.
- Required for any future incident review.

## Files to create

### Backend
- `src/api/routes/shared-resolve.ts`
  - `POST /resolve` handler. Validates body shape, applies rate limit, calls resolver, returns response.
  - 400 on malformed body, 429 on rate limit, 200 otherwise.
- `src/api/shared/wikilink-resolver.ts`
  - `resolveWikilinks(token, targets) → resolutions[]`. Pure function over the DB. No HTTP.
  - Encapsulates the four-query lookup strategy above.
- `tests/shared-resolve.test.ts`
  - Note-share → target with own share → resolves to note token.
  - Note-share → target without share → null.
  - Note-share → target in different folder → null.
  - Note-share → self-link → resolves to same token.
  - Folder-share → target in same folder → resolves to folder token.
  - Folder-share → target in sub-folder → resolves to folder token.
  - Folder-share → target with own share → resolves to note token (not folder token).
  - Folder-share → target in different folder, no share → null.
  - URL-form target → null.
  - Title with no matching note → null.
  - Title matching multiple notes → null.
  - Revoked note share → null.
  - Expired note share → null.
  - Revoked folder share → null.
  - Empty targets array → empty resolutions.
  - Rate limit exceeded → 429.
  - Malformed token → 400.
  - Oversized targets array → 400.
  - Cache hit on second identical request.
  - Cache invalidation on share revoke.

### Frontend
- `src/frontend/lib/api.ts` — add `resolveSharedWikilinks(token, targets)` method.
- `src/frontend/lib/shared-wikilink-resolver.ts` — client-side batching + caching.
  - Collects unique `[[X]]` targets from the markdown source.
  - Calls the resolver once per note load.
  - Returns `Map<target, shareToken | null>`.
- `src/frontend/components/shared-markdown-renderer.tsx` — update to:
  - Accept the resolution map as a prop.
  - Render resolved wikilinks as `<a href="/share/<token>">` with the `me-wikilink me-wikilink--resolved` class.
  - Render unresolved wikilinks as the existing styled-but-no-`href` placeholder (current behavior).
  - Skip the click handler that routed to "not available" — only attach `href` to resolved links.
- `src/frontend/routes/share.$token.tsx` — call the resolver before rendering, pass the map to `SharedMarkdownRenderer`.
- `src/frontend/routes/share.folders.$token.tsx` — same.

### Optional test
- `tests/browser/shared-wikilink-resolver.spec.ts` — Playwright spec that loads a shared note with `[[X]]` and asserts the resolved link points to the target's share URL.

## Frontend rendering states

| Resolver state | Visual | Click behavior |
|---|---|---|
| `shareToken !== null` | `me-wikilink me-wikilink--resolved` (solid underline, link color) | Navigate to `/share/<token>` |
| `shareToken === null` | `me-wikilink me-wikilink--unknown` (dotted underline, link color) | No-op (no `href`) |
| Loading | Same as `null` for one frame, then resolves | — |

## Build phases (suggested order)

1. **API + tests first** — build the resolver, batched lookups, rate limiting, audit log. Land with tests green.
2. **OpenAPI** — document the new endpoint in `src/api/openapi/harness.ts` (or a new `share.ts`).
3. **Cache layer** — add the in-memory LRU with invalidation on share revoke. Test invalidation paths.
4. **Frontend integration** — collect targets, call resolver, pass map to renderer. Land with the rendering states above.
5. **Browser test** — Playwright spec for the resolved and unresolved states.

## Verification

- `pnpm typecheck`
- `pnpm exec biome check --write <changed-files>`
- `pnpm test` — all 165+ existing tests pass, plus the new `shared-resolve.test.ts` cases.
- Manual: open the two seeded notes from the previous phase, click wikilinks between them, confirm navigation to the other shared view.
- Manual: open a shared note with a `[[Private Note]]` wikilink, confirm it renders as "not available" (dotted underline, no `href`).
- Manual: revoke the target note's share, reload the source shared view (after cache TTL), confirm the link degrades to "not available".

## Acceptance criteria

- [ ] `POST /internal/share/resolve` returns `{ resolutions: [{ target, shareToken }] }` for any valid token + target list.
- [ ] A target is resolvable iff the reachability rule above holds. All edge cases have tests.
- [ ] The response never contains the note's `/notes/<id>` URL, title, folder, or any other metadata.
- [ ] Rate limiting returns 429 above the threshold; oversized requests return 400.
- [ ] Revoked/expired shares return `shareToken: null`.
- [ ] Cache invalidation removes stale resolutions when a share is revoked.
- [ ] Frontend renders resolved wikilinks as clickable links to `/share/<token>`.
- [ ] Frontend renders unresolved wikilinks with no `href` (current "not available" behavior).
- [ ] `pnpm test` and `pnpm typecheck` pass clean.
- [ ] No new runtime dependencies.

---

# Shared-View Wikilink Resolver Remediation Plan

Goal: replace the generic token resolver and process-local TTL cache with source-bound wikilink destinations that preserve share capability boundaries, support direct navigation inside folder shares, remain fresh after owner writes, and stay simple until production measurements justify broader optimization.

## Decisions

- Keep the renderer-only foundation from commit `73086fa`.
- Remove the process-local LRU cache, cache middleware, invalidation hooks, and cache tests from `ead8ab9`.
- Do not expose a generic endpoint that accepts arbitrary target guesses. Resolve only wikilinks actually authored in the shared source note.
- Include wikilink resolutions in the shared-note content response rather than making a second client request.
- Return narrow server-generated public destinations as `{ target, href }`; unresolved targets return `href: null`.
- A single-note share may resolve:
  - a self-link to its current public URL;
  - an authored target with its own active note share to that target's public note URL;
  - nothing through an unrelated folder-share token.
- A folder-share note may resolve:
  - an authored target inside the current shared folder subtree to `/share/folders/<current-token>?note=<note-id>`;
  - an authored target outside the subtree only when it has its own active note share;
  - all other targets to `href: null`.
- Keep the existing shared-folder response contract, including note content. Payload splitting is a separate performance project that requires measurement and is not necessary for wikilink navigation.
- Add a source-bound read-only endpoint for one selected note inside a folder share. It returns only that note's authored wikilink resolutions; it does not accept arbitrary targets or duplicate note content.
- Use the existing wikilink parser/link index where practical, with shared target normalization so the backend resolution keys and renderer `data-wikilink-target` values cannot drift.
- Resolve candidates and active shares in bounded batch queries. No per-target database calls.
- Keep rate limiting and audit logging deferred, but apply the existing request-size middleware to any new public write endpoint if one remains. The preferred design uses GET endpoints and no client-supplied target array.

## Cache decision record

The first release will not use an application TTL cache because:

- immediate revocation, regeneration, deletion, and edit freshness are security/correctness requirements;
- invalidation would need to cover user edits, harness edits, restores, moves, creates, deletes, folder hierarchy mutations, share lifecycle changes, ancestor folder shares, and resolver dependencies under other source tokens;
- a process-local cache does not absorb aggregate traffic across multiple serverless instances;
- entry-count limits do not bound memory when shared-folder payloads contain arbitrary note content;
- a bounded batch resolver and smaller folder responses should be measured before introducing invalidation complexity.

If production measurements later justify caching, prefer this order:

1. Client/TanStack Query caching for the current page lifecycle.
2. Conditional requests and ETags for shared resources.
3. In-flight request coalescing to collapse identical concurrent work without retaining stale data.
4. CDN or distributed caching only with an explicit revocation/purge strategy and documented maximum stale window.
5. If an application cache is still needed, use hashed, order-correct, byte-bounded keys; dependency/version-based invalidation; active-share expiry bounds; and cold-concurrency tests with instrumented computation/DB counts.

## Files to remove

- `src/api/middleware/shared-cache.ts`
- `src/api/shared/cache.ts`
- `src/api/shared/cache-invalidation.ts`
- `src/api/routes/shared-resolve.ts`
- `tests/shared-cache.test.ts`

## Files to create

- `docs/implementation/shared-view-wikilinks.md`
  - Document capability boundaries, source-bound resolution, public destination shapes, folder deep-link behavior, the no-cache decision, and the measured path for adding caching later.
- Optional `src/shared/wikilinks.ts`
  - Extract shared parsing/target-normalization helpers if needed to keep API indexing and shared rendering aligned.

## Files to modify

### Backend

- `src/api/index.ts`
  - Remove the generic resolver route registration/import.
  - Remove cache-related imports and add request middleware only if the final endpoint shape requires it.
- `src/api/routes/share.ts`
  - Remove cached response wrappers.
  - Include source-bound `{ target, href }` resolutions in single-note responses.
  - Preserve the existing folder landing response contract.
  - Add `GET /internal/share/folders/:token/notes/:noteId/wikilinks` for one authorized source note's resolutions.
  - Ensure the token is active and the source note belongs to the shared folder subtree on every request.
- `src/api/shared/wikilink-resolver.ts`
  - Rewrite around a validated source note/share context.
  - Intersect resolution with wikilinks authored in that source.
  - Batch candidate, note-share, and folder-tree lookups.
  - Return public hrefs rather than bare tokens.
- `src/api/notes/links.ts`
  - Reuse shared wikilink target normalization if extracted; preserve existing backlink/index behavior.
- `src/api/routes/notes.ts` and `src/api/routes/folders.ts`
  - Remove all cache invalidation imports and hooks.
- `src/api/openapi/harness.ts`
  - Remove the generic `/internal/share/resolve` operation and schemas.
  - Document the revised shared-note/folder-note response shapes if public share endpoints remain in this spec.

### Frontend

- `src/frontend/lib/api.ts`
  - Remove `resolveSharedWikilinks()`.
  - Add `{ target, href }` resolution types to shared-note responses.
  - Preserve the existing shared-folder response type and add `sharedFolderNoteWikilinks(token, noteId)`.
- `src/frontend/components/shared-markdown-renderer.tsx`
  - Remove resolver API effects and `shareToken` coupling.
  - Accept a resolution list/map as a prop and apply only server-provided public hrefs.
  - Preserve unresolved links without `href` and preserve skipped code/link elements.
- `src/frontend/routes/share.$token.tsx`
  - Pass response resolutions directly to the renderer.
- `src/frontend/routes/share.folders.$token.tsx`
  - Drive selected note state from a validated `?note=` search parameter using the already-loaded folder payload.
  - Fetch only the selected note's source-bound resolutions.
  - Pass its resolutions to the renderer.
  - Keep folder/back navigation and invalid-note behavior clear.

### Tests

- `tests/shared-resolve.test.ts`
  - Rewrite as source-bound shared-wikilink integration coverage, or rename to `tests/shared-wikilinks.test.ts`.
  - Cover authored vs arbitrary targets, self-links, active/revoked/expired note shares, duplicate titles, stable ID targets, cross-user targets, folder subtree targets, outside-folder targets, and narrow response fields.
  - Instrument DB/computation boundaries where practical to assert query count does not grow with target count.
- `tests/share-links.test.ts`
  - Verify note share responses include fresh source-bound resolutions and revoked/regenerated links stop immediately.
- `tests/folder-share-links.test.ts`
  - Verify the existing folder landing contract remains stable, selected-note resolution enforces subtree membership, and revoke/regeneration take effect immediately.
- `tests/openapi.test.ts`
  - Remove generic resolver assertions and verify revised response schemas if documented.
- `tests/browser/fixtures.ts`
  - Replace generic resolver mocks with shared-note responses and selected-folder-note wikilink responses containing destinations.
- `tests/browser/shared-wikilinks.spec.ts`
  - Add genuine unresolved-link coverage.
  - Cover independently shared note navigation.
  - Cover direct navigation within a folder share and loading a folder URL with `?note=`.
  - Confirm arbitrary/unshared targets receive no `href`.
- Update other tests whose shared-folder fixtures currently expect note content in the landing response.

## Implementation checklist

- [x] Phase 1: Remove cache and generic resolver surface.
  - Evidence: no cache/resolver references remain; `pnpm typecheck`, 165 unit/integration tests, and 14 browser tests pass.
- [x] Phase 2: Implement source-bound batched destination resolution.
  - Evidence: shared parser excludes inline/fenced code; resolver returns only `{ target, href }` for authored links; note contexts do not bridge folder capabilities; folder contexts use subtree deep links; repository-call count remains constant at three for 100 targets; 174 unit/integration tests and typecheck pass.
- [x] Phase 3: Wire source-bound resolutions into shared-note responses and add the authorized selected-folder-note wikilink endpoint without changing the folder payload.
  - Evidence: shared-note GET responses include fresh source-bound resolutions; `GET /internal/share/folders/:token/notes/:noteId/wikilinks` validates active token and subtree membership; the existing folder landing payload remains unchanged; 176 unit/integration tests and typecheck pass.
- [x] Phase 4: Simplify frontend rendering to consume server-provided destinations and support `?note=` folder deep links.
  - Evidence: shared-note views consume response resolutions; folder views fetch only selected-note resolutions; route search state supports direct `?note=` loading and back-to-folder behavior; renderer applies only server-provided `/share/` hrefs and resets stale hrefs; typecheck and existing folder-sharing browser tests pass.
- [x] Phase 5: Update API, integration, security, and browser tests.
  - Evidence: OpenAPI documents both public source-bound GET responses; integration tests cover authored/unresolved links, capability boundaries, subtree enforcement, revoke freshness, and constant batched repository calls; browser tests cover note-share navigation, genuine unresolved links, direct folder `?note=` loading, in-folder navigation, and back behavior; 177 unit/integration tests and 16 browser tests pass.
- [x] Phase 6: Add the implementation/caching decision document.
  - Evidence: `docs/implementation/shared-view-wikilinks.md` records optimization priorities, capability boundaries, source-bound contracts, frontend behavior, bounded database work, the no-cache rationale, and requirements for any measured future cache; the existing MinuEditor wikilink spec links to it.
- [x] Phase 7: Run formatting, typecheck, targeted tests, full tests, browser tests, and production build.
  - Evidence: Biome completed on every changed TypeScript/TSX file with only existing unsafe class-order/non-null warnings; typecheck passed; 177 unit/integration tests passed; 16 browser tests passed; production build passed with the existing large-chunk advisory; `git diff --check` passed; generated Playwright artifacts were removed; final security review added multiline inline-code exclusion coverage.

## Verification

- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck`
- Targeted tests for shared notes, folder shares, wikilink resolution, OpenAPI, and browser navigation.
- `pnpm test`
- `pnpm test:browser`
- `pnpm build`
- Confirm the working tree contains no generated Playwright artifacts.

## Approval status

- [x] Detailed remediation plan approved.
- [x] Implementation started.
- [x] Agent implementation and automated verification complete.
