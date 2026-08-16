# Permissions and OAuth Hardening — Implementation Plan

## Status

**Implemented and verified.**

## Decisions

- Authorization-level capabilities are the maximum ceiling for an API key or OAuth connection.
- Per-authorization folder rules may restrict that ceiling by folder; they cannot grant a capability disabled globally.
- For `all` access, folders without a rule use the authorization ceiling. A folder rule narrows access.
- Folder rules support `exact` or `subtree` application; the nearest applicable rule wins before intersecting with the global ceiling.
- Private and trashed folders remain denied regardless of authorization or folder rules.
- Keep the existing folder-wide `isAgentReadOnly` safety policy; do not introduce or change a workspace model in this work.
- Unify API-key and OAuth policy under `integration_authorizations`.
- Preserve existing API-key and OAuth authorization IDs and external behavior.
- Supported OAuth scopes:
  - `notes.read`
  - `notes.create`
  - `notes.edit`
  - `comments.write`
  - `folders.create`
- Unknown OAuth scopes fail with `invalid_scope`.
- Effective OAuth permissions are the intersection of requested scope, owner-approved capabilities, and current authorization state.
- Existing scopes are normalized from stored capability booleans during migration.
- Deliver the OAuth security fixes before the larger authorization-schema migration.

## Phase 1 — OAuth security fixes

### Scope enforcement

- [x] Add canonical scope constants, parsing, normalization, and capability mapping in `src/api/lib/oauth.ts`.
- [x] Advertise `scopes_supported` in OAuth metadata.
- [x] Validate scopes during preview and approval.
- [x] Prevent approval from granting capabilities outside the client’s requested scopes.
- [x] Store the final approved scope rather than copying the request unchanged.
- [x] Derive effective OAuth capabilities during bearer authentication as authorization capability intersected with access-token scope.
- [x] Ensure refresh tokens cannot increase scope.
- [x] Normalize legacy authorizations, codes, and tokens from their capability booleans.
- [x] Update OAuth consent UI to disable capabilities outside the requested scope.

### Atomic credential consumption

- [x] Atomically claim authorization codes with a conditional update in a write batch.
- [x] Atomically claim refresh tokens with a conditional update in a write batch.
- [x] Perform credential claim and replacement-token insertion in one transaction.
- [x] Return `invalid_grant` when another request has already claimed the credential.
- [x] Ensure failed token insertion rolls back the claim.
- [x] Keep access-token authentication fail-closed for revoked or expired authorization state.

### Tests

- [x] Reject unknown OAuth scopes.
- [x] Verify metadata publishes supported scopes.
- [x] Verify a read-only request cannot approve or receive edit access.
- [x] Verify stored token scope reflects the approved subset.
- [x] Verify a deliberately mismatched token and authorization are restricted to their intersection.
- [x] Verify refresh does not widen scope.
- [x] Race two authorization-code exchanges and verify exactly one succeeds.
- [x] Race two refresh requests and verify exactly one succeeds.
- [x] Verify rollback does not permanently consume a credential if issuance fails.

## Phase 2 — Unified authorization schema

### New model

```text
integration_authorizations
- id
- user_id
- access_mode
- can_read
- can_create
- can_edit
- can_comment
- can_create_folders
- created_at
- updated_at
- last_used_at
- revoked_at

authorization_folder_rules
- id
- authorization_id
- user_id
- folder_id
- applies_to          # exact | subtree
- can_read
- can_create
- can_edit
- can_comment
- can_create_folders
- created_at
- updated_at

UNIQUE (authorization_id, folder_id)
```

- [x] Add `integration_authorizations`.
- [x] Add `authorization_folder_rules`.
- [x] Make API keys reference one integration authorization through the expand migration.
- [x] Make OAuth authorizations reference one integration authorization through the expand migration.
- [x] Remove capability and authorization-lifecycle fields from credential-specific records.
- [x] Preserve folder capability fields as explicit restrictions beneath the authorization ceiling.
- [x] Add `applies_to` with `exact | subtree` semantics to current folder rules and migration backfill.
- [x] Add one shared evaluator and update `src/api/lib/folder-access.ts` to use nearest applicable folder rules.
- [x] For `all` access, default folders without rules to the authorization ceiling.
- [x] For `top_level` and `specific` access, require matching rules to place a folder in scope.
- [x] Keep API responses composed so the frontend still receives capabilities with each key or connected app.
- [x] Retain `permissions` as the API field for the folder-rule collection to minimize frontend churn.

### Database constraints

- [x] Add `CHECK` constraints for every unified authorization and rule boolean.
- [x] Add a `CHECK` constraint for valid access modes.
- [x] Add `CHECK (NOT can_comment OR can_read)`.
- [x] Add unique `(id, user_id)` keys required for composite references.
- [x] Add `user_id` to folder rules.
- [x] Enforce `(authorization_id, user_id) → integration_authorizations(id, user_id)`.
- [x] Enforce `(folder_id, user_id) → folders(id, user_id)`.
- [x] Add unique credential/folder constraints to current API-key and OAuth rules; retain the constraint in the unified rule table.

### Folder hierarchy integrity

- [x] Add `(parent_folder_id, user_id) → folders(id, user_id)`.
- [x] Add `CHECK (parent_folder_id IS NULL OR parent_folder_id <> id)`.
- [x] Retain transactional application validation for depth and cycles.
- [x] Add database tests for cross-owner and self parents; existing application tests cover cycle prevention.

### Data migration

- [x] Add a preflight query/script for duplicate rules, cross-tenant rules, malformed parents, per-folder capability differences, and invalid capability dependencies.
- [x] Treat existing per-folder capability differences as migratable policy, not corruption.
- [x] Fail migration on malformed ownership or hierarchy rather than silently broadening access.
- [x] Backfill one integration authorization per existing API key.
- [x] Backfill one integration authorization per existing OAuth authorization.
- [x] Backfill unique folder rules while preserving their current capability restrictions.
- [x] Derive `applies_to = subtree` for existing project-root rules and `exact` for specific-folder rules.
- [x] Preserve IDs, revocation state, timestamps, and last-used state.
- [x] Normalize OAuth scopes from migrated capabilities.
- [x] Verify authorization/rule mirrors through preflight and migration tests before contract cleanup.
- [x] Implement the expand and read-cutover stages with legacy-to-unified synchronization triggers.
- [x] Complete the contract stage by removing legacy capability/lifecycle columns, permission tables, and temporary synchronization triggers.

## Phase 3 — Transactional permission operations

- [x] Create API key and grants in one transaction; unified authorization insertion follows Phase 2.
- [x] Replace API-key capabilities and grants in one transaction.
- [x] Create OAuth authorization, grants, and authorization code in one transaction.
- [x] Create an integration-owned folder and its specific-scope grant in one transaction.
- [x] Revoke OAuth authorization and associated credentials in one transaction.
- [x] Deduplicate folder IDs before writes.
- [x] Use conflict-safe inserts backed by the unique grant constraint.
- [x] Add failure-injection tests proving no partial records remain.

## Phase 4 — Application and documentation updates

- [x] Update API-key settings types to use folder rules.
- [x] Update the API-key dialog to configure capability restrictions for individual folders.
- [x] Clearly label authorization capabilities as the global maximum and folder capabilities as restrictions.
- [x] Update connected-app display to read capabilities from the unified authorization.
- [x] Update OAuth consent UI for requested-scope ceilings.
- [x] Update OAuth, MCP, harness, and agent-integration documentation.
- [x] Document capability precedence:

```text
credential valid
AND authorization active
AND global capability ceiling allows action
AND OAuth scope allows action, when applicable
AND folder is in authorization scope
AND nearest folder rule allows action, when present
AND folder safety policy allows action
```

## Files to create

- [x] `src/api/lib/integration-authorization.ts`
- [x] `scripts/verify-permission-migration.ts`
- [x] Generated OAuth scope, unique-rule, and rule-inheritance migrations and metadata; unified-schema migration remains.
- [x] `tests/permission-schema.test.ts`, or equivalent focused schema/migration tests

## Files to modify

- [x] `src/api/db/schema.ts`
- [x] `src/api/lib/oauth.ts`
- [x] `src/api/lib/folder-access.ts`
- [x] `src/api/middleware/authentication.ts`
- [x] `src/api/routes/oauth.ts`
- [x] `src/api/routes/api-keys.ts`
- [x] `src/api/routes/harness.ts`
- [x] `src/frontend/lib/api.ts`
- [x] `src/frontend/components/api-key-access-dialog.tsx`
- [x] `src/frontend/routes/oauth.authorize.tsx`
- [x] `src/frontend/routes/settings.api-access.tsx` (verified against composed API responses; no code change required)
- [x] `tests/oauth.test.ts`
- [x] `tests/api-key-permissions.test.ts`
- [x] `tests/harness-folder-access.test.ts`
- [x] Other tests that directly seed legacy permission rows
- [x] Relevant OAuth, MCP, harness, and agent-integration documentation

## Verification

- [x] Run the current migrations against fresh databases in focused tests.
- [x] Run OAuth scope and folder-rule inheritance migrations against a populated legacy fixture.
- [x] Compare mirrored authorization and folder-rule state after migration.
- [x] Test migration/database rejection for malformed ownership, hierarchy, and policy state.
- [x] Run focused OAuth concurrency tests.
- [x] Run permission and object-access tests.
- [x] Run `pnpm exec biome check --write <changed-files>` without unsafe fixes.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
- [x] Run `git diff --check`.

## Code-review remediation

- [x] Update hosted MCP OAuth fixtures to the unified authorization shape.
- [x] Fail closed when an integration actor is missing its shared authorization identifier.
- [x] Return OAuth `temporarily_unavailable` with HTTP 503 after database-busy retries are exhausted.
- [x] Recognize local and wrapped Turso/libSQL busy errors.
- [x] Add `--through <migration>` support to the migration runner.
- [x] Run permission preflight automatically before pending permission migrations on populated databases.
- [x] Apply each migration file and its migration record atomically, while handling foreign-key PRAGMAs outside the transaction.
- [x] Add migration-runner range, preflight, and rollback tests.
- [x] Add OAuth scope allowlist auditing to post-migration verification.
- [x] Add an integration-authorization rollout runbook covering backup, expand/deploy/contract sequencing, smoke tests, and rollback gates.
- [x] Document nearest-rule-wins behavior and the intentional `top_level` semantic change.
- [x] Run Biome, typecheck, the full test suite, build, permission verification, and diff checks.

## Acceptance criteria

- [x] OAuth tokens cannot exercise capabilities outside their granted scope.
- [x] Authorization codes and refresh tokens can be consumed only once under concurrency.
- [x] Unified permission state cannot contain duplicate or cross-tenant folder rules.
- [x] Folder hierarchy rows cannot reference missing, self, or cross-tenant parents.
- [x] API-key and OAuth access use one shared authorization evaluator.
- [x] Global capabilities are an explicit maximum ceiling and folder-rule capabilities are explicit restrictions with deterministic precedence.
- [x] A global key can be read-only in one folder, read/create in another, and unrestricted elsewhere without broadening access.
- [x] No workspace model or workspace behavior is introduced or changed.
- [x] Credential and rule changes are atomic.
- [x] Migration preserves existing folder restrictions and never silently broadens access.
