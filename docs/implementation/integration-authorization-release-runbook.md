# Integration Authorization Release Runbook

This rollout moves API-key and OAuth permissions to one shared authorization model. Migrations `0028`–`0032` expand and backfill the model. Migrations `0033`–`0034` remove the legacy permission schema and enforce credential ownership constraints.

## Authorization precedence

Effective access requires every layer below to allow the operation:

1. The credential is valid.
2. The shared authorization is active.
3. The global capability ceiling allows the operation.
4. The OAuth token and connection scopes allow it, when applicable.
5. The folder is in authorization scope.
6. The nearest applicable folder rule allows it.
7. Folder safety policy allows it; private, trashed, and agent-read-only restrictions still apply.

For `all` access, a folder without a rule inherits the global ceiling. For `top_level` and `specific`, a matching rule is required. Rules use `exact` or `subtree`; when multiple ancestor rules could apply, the nearest rule wins. This intentionally replaces the legacy `top_level` behavior where any allowing ancestor could grant access.

## Required gates

Before either migration phase:

- Use a clean, pushed release candidate from `main`.
- Create and verify a Turso database backup using the provider-approved backup procedure. Record its identifier and creation time in the release record.
- Run `pnpm db:verify-permissions` against the target environment.
- Run a migration dry run with the intended `--through` boundary.
- Stop on duplicate grants, malformed hierarchy, cross-tenant ownership, missing authorizations, invalid OAuth scopes, or any other preflight failure.

The migration runner invokes permission preflight automatically when migrations `0028`–`0034` are pending on a populated database. Each migration file and its migration record are committed atomically. Foreign-key PRAGMAs required by table rebuilds are applied outside that transaction and restored afterward.

## Phase A: expand and deploy

1. Verify the target stops at migration `0032`:

   ```bash
   pnpm db:migrate:production -- --dry-run --through 0032
   ```

2. Run the production release with the same boundary:

   ```bash
   pnpm release:production -- --through 0032
   ```

3. Confirm no migration later than `0032` was recorded.
4. Smoke test:
   - API-key authentication and folder listing;
   - a global key with two different folder restrictions;
   - OAuth authorization-code exchange and refresh rotation;
   - hosted MCP read and denied-write behavior;
   - private, trashed, and agent-read-only folder denial.
5. Run `pnpm db:verify-permissions` against production again. This includes an OAuth authorization-scope allowlist audit.
6. Soak the new application and inspect authentication and integration error logs before contract migration approval.

The application code is compatible with the expanded schema through `0032`; the legacy trigger bridge keeps old and unified records synchronized during this phase.

## Phase B: contract

Proceed only when every running application instance uses the unified authorization code.

1. Confirm the Phase A backup and release record are available.
2. Create and verify a fresh pre-contract Turso backup.
3. Run:

   ```bash
   pnpm db:verify-permissions
   pnpm db:migrate:production -- --dry-run --through 0034
   pnpm db:migrate:production -- --through 0034
   pnpm db:verify-permissions
   ```

4. Confirm `PRAGMA foreign_key_check` reports no rows using an authorized database console or equivalent provider query.
5. Repeat the API-key, OAuth, hosted MCP, and folder-policy smoke tests.

Migrations `0033`–`0034` are not compatible with the old application. Do not apply them while an old instance can receive traffic.

## Failure and rollback gates

- **Before `0033`:** stop the rollout and keep or restore the Phase A application. The legacy schema remains available.
- **During a migration file:** the runner rolls back that file and does not record it. Resolve the cause, rerun preflight, and retry.
- **After `0033`:** do not roll application code back to the legacy authorization implementation. Either fix forward with the unified application or restore the verified pre-contract database backup as part of a coordinated rollback.
- **OAuth scope audit failure:** do not continue. Normalize or revoke affected authorizations and require reauthorization when the intended grant cannot be proven.
- **Smoke-test failure:** stop, preserve logs and migration output, and do not tag the release.
