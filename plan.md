# Email and Bot Protection — Implementation Plan

## Status

**Approved; implementation in progress on `feat/email-bot-protection`.**

## Decisions

- Package: private `@minunotes/email-protection` workspace package.
- SES provider errors fail open only after local access, disposable-domain, and durable rate checks pass.
- OTP/email limit: 3 requests per 10 minutes.
- Client limit: 10 requests per 10 minutes.
- Ban: 5 confirmed-invalid violations in 24 hours; 24-hour duration.
- Cache: PASS 24 hours, FAIL 1 hour; SES timeout 2 seconds.
- Protection identifiers use keyed HMACs; logs must not contain OTPs, full emails, or raw IPs.
- Deployed client identity comes from API Gateway request context, not forwarding headers.

## Files to create

- [x] `packages/email-protection/package.json`
- [x] `packages/email-protection/tsconfig.json`
- [x] `packages/email-protection/README.md`
- [x] `packages/email-protection/src/**`
- [x] `packages/email-protection/tests/**`
- [x] `src/api/lib/email-protection.ts`
- [x] `src/api/middleware/client-identity.ts`
- [x] Package and integration protection tests
- [x] `docs/email-bot-protection.md`
- [x] Generated Drizzle migration and metadata

## Files to modify

- [x] `package.json`
- [x] `pnpm-lock.yaml`
- [x] `src/api/db/schema.ts`
- [x] `src/api/lib/auth.ts`
- [x] `src/api/lib/env.ts`
- [x] `src/api/routes/auth.ts`
- [x] `src/api/middleware/rate-limit.ts`
- [x] `src/api/index.ts` not required; Hono exposes API Gateway context through route environment
- [x] `sst.config.ts`
- [x] `.env.example`
- [x] Relevant auth and API-access tests

## Phase 1 — Reusable package

- [x] Implement framework-independent risk engine, policy types, identity hashing, and injected clock.
- [x] Add disposable-domain and SESv2 providers with timeout handling.
- [x] Add exact-route Better Auth adapter.
- [x] Test malformed input, cached verdicts, provider verdicts/errors, and bypass behavior.

## Phase 2 — Durable controls

- [x] Add hashed verdict cache, rate bucket, and client reputation schema.
- [x] Generate migration.
- [x] Implement atomic windowed counters and predictable ban recovery.
- [x] Test concurrency, expiry, reset, and privacy behavior.

## Phase 3 — MinuNotes integration

- [x] Resolve trusted API Gateway client identity with a bounded local fallback.
- [x] Reuse trusted identity in API rate limiting.
- [x] Move `ALLOWED_LOGIN_EMAILS` before OTP creation.
- [x] Register protection before OTP creation/sending.
- [x] Ensure delivery failures throw and OTP values are never logged.
- [x] Add validated environment configuration.

## Phase 4 — Infrastructure and rollout

- [x] Grant `ses:GetEmailAddressInsights` through the Lambda role.
- [x] Add off/observe/enforce modes and safe defaults.
- [x] Add redacted telemetry and operations documentation.
- [x] Add a safe local/development verification script with production opt-in and cleanup.

## Verification

- [x] Run `pnpm exec biome check --write <changed-files>` without unsafe fixes.
- [x] Run package and focused tests.
- [x] Run migration against fresh and current-schema temporary databases.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
- [x] Run `git diff --check`.

## Acceptance criteria

- [x] Valid authorized users can receive OTPs.
- [x] Unauthorized, disposable, and abusive requests stop before sending.
- [x] Spoofed forwarded headers cannot evade deployed controls.
- [x] Concurrent increments are not lost; expired violations and bans recover.
- [x] SES outages do not poison valid identities.
- [x] Logs/tables contain no OTPs or raw email/IP identifiers.
- [x] AWS SDK uses role credentials with least-privilege SES permissions.
- [x] Core package imports no MinuNotes application code.

## Code review follow-up — Approved

### Integration hardening

- [x] Add a real Better Auth handler test for the OTP send route and disposable-email rejection.
- [x] Prove a blocked request never invokes the OTP sender.
- [x] Add an engine-level client-ban contract test.
- [x] Run package tests, root tests, TypeScript, Biome, and diff checks.

### Expired-state cleanup and rollout documentation

- [x] Extend cleanup to remove stale unbanned reputation rows after the violation window.
- [x] Return redacted cleanup counts for operational logging.
- [x] Add a dedicated email-protection cleanup function and scheduled SST handler.
- [x] Test expired deletion and preservation of active protection state.
- [x] Document that observe mode accumulates state and define the observe-to-enforce reset option.
- [x] Run package tests, root tests, TypeScript, build, Biome, and diff checks.

### Files

- [x] `packages/email-protection/package.json`
- [x] `packages/email-protection/src/types.ts`
- [x] `packages/email-protection/src/stores/sqlite.ts`
- [x] `packages/email-protection/tests/engine.test.ts`
- [x] `packages/email-protection/tests/sqlite.test.ts`
- [x] `packages/email-protection/tests/better-auth-integration.test.ts`
- [x] `src/api/email-protection/cleanup.ts`
- [x] `src/api/email-protection/cleanup-handler.ts`
- [x] Application-level cleanup test not required; package store tests cover cleanup and handler wiring is minimal.
- [x] `sst.config.ts`
- [x] `docs/email-bot-protection.md`
