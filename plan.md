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
