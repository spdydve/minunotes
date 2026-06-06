# Local Release Pipeline Plan

## Objective
Add a reliable local CI/CD-style release flow for dev and production deployments.

## Goals
- Run checks before deployment.
- Run migrations before deployment.
- Smoke check the deployed API/web app.
- Provide safer down/remove commands with confirmation.

## Files to modify/create
- `package.json`
- `scripts/release.ts` — local release runner.
- `scripts/down.ts` — confirmation wrapper for SST remove.
- `src/api/routes/health.ts` or existing API router file — health endpoint.
- API route registration file, if health needs to be mounted.
- Possibly `scripts/migrate.ts` if status/dry-run support is needed.

## Proposed package scripts
- `ci:local`: `pnpm typecheck && pnpm test && pnpm build`
- `release:dev`: run dev checks, migrate dev, deploy dev, smoke.
- `release:production`: require main/clean tree/confirmation, migrate production, deploy production, smoke.
- `down:dev`: confirmation wrapper for dev remove.
- `down:production`: stricter confirmation wrapper for production remove.

## Release flow
### Dev
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm db:migrate:dev`.
- [ ] Run `pnpm deploy:dev`.
- [ ] Smoke check dev API health URL.
- [ ] Smoke check dev web URL.

### Production
- [ ] Require `main` branch.
- [ ] Require clean working tree.
- [ ] Require typed confirmation.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm db:migrate:production`.
- [ ] Run `pnpm deploy:production`.
- [ ] Smoke check production API health URL.
- [ ] Smoke check production web URL.

## Health endpoint
- [x] Add `GET /health`.
- [x] Return `{ ok, environment, time, db }`.
- [x] Perform a lightweight DB query to verify connectivity.

## Verification
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] `pnpm release:dev` completes successfully.
- [ ] `pnpm down:dev` prompts before removing.
- [ ] Production release/down safeguards can be dry-run reviewed without executing production destructive actions.

## Approval
Waiting for approval before code changes.
