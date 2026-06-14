# OAuth Integrations Plan

## Why we are doing this

OAuth gives MinuNotes a safer and more standard way to connect hosted third-party tools, especially ChatGPT/MCP clients, without asking users to copy long-lived API keys into external products.

API keys remain the right fit for local/private agents, scripts, CI, and trusted developer workflows. OAuth is for user-authorized connected apps.

## Benefits

- **User-controlled consent**: users can approve a connection from the MinuNotes UI instead of manually copying secrets.
- **Scoped access**: OAuth grants can use the same folder/project/specific-folder permission model as API keys.
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
- Share the existing folder access model with API keys as much as possible.
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
- [ ] Add OAuth schema and migration.
- [ ] Add OAuth token hashing/generation helpers.
- [ ] Add Authorization Code + PKCE route skeleton.
- [ ] Add token exchange route.
- [ ] Add revoke route.
- [ ] Add discovery metadata endpoints.
- [ ] Add tests for PKCE validation, redirect URI validation, token issuance, token revocation.

### Phase 2: Shared integration actor permissions
- [ ] Introduce shared actor resolution for API key and OAuth bearer tokens.
- [ ] Keep existing `X-API-Key` behavior working.
- [ ] Add `Authorization: Bearer <token>` support for harness and hosted MCP.
- [ ] Update folder/note permission checks to work with OAuth authorization permissions.
- [ ] Add tests proving API key and OAuth actor permissions match.

### Phase 3: Consent and connected app management
- [ ] Add OAuth consent UI for selecting folder permissions and folder creation capability.
- [ ] Add connected apps list in settings.
- [ ] Add revoke connected app action.
- [ ] Add tests for consent creation and revocation.

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

## Open questions

- Should OAuth clients be manually registered by the MinuNotes owner, or should users create OAuth apps in settings?
- Should ChatGPT be a first-party predefined OAuth client or a user-created client?
- Does ChatGPT Apps SDK require OAuth discovery at root `/.well-known/*`, `/api/.well-known/*`, or both?
- Does ChatGPT require Dynamic Client Registration for submitted apps, or is static client registration enough?
- Should OAuth access tokens be opaque DB-backed tokens initially, or signed JWTs?
- How should refresh token rotation be handled in the first implementation?
- Should OAuth authorizations internally create hidden API keys, or should they use first-class OAuth permission tables?

## Recommended initial decisions

- Use opaque DB-backed tokens first.
- Use first-class OAuth permission tables rather than hidden API keys.
- Support Authorization Code + PKCE only at first.
- Treat ChatGPT as a static configured OAuth client during early development.
- Keep API keys indefinitely for local/private agents and MCP clients.
- Add Bearer support to `/api/harness/*` and `/api/mcp` only after shared actor permissions are ready.

## Verification plan

- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `pnpm build`.
- [ ] OAuth unit/integration tests pass.
- [ ] Existing API key harness tests pass unchanged.
- [ ] Existing hosted MCP tests pass with `X-API-Key`.
- [ ] New hosted MCP tests pass with `Authorization: Bearer`.
- [ ] Manual ChatGPT connector smoke test after Phase 4.

## Approval

Planning only. Do not implement until this plan is approved and phase scope is selected.
