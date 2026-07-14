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
