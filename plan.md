# 30-day Trash retention plan

## Objective

Add a safe 30-day retention deadline for notes, templates, canvases, and folder batches in Trash, plus a scheduled purge worker that can be evaluated in disabled or dry-run mode before automatic permanent deletion is enabled.

## Definition of done

- Every newly trashed standalone note/template/canvas and folder batch receives a durable `purge_after` timestamp 30 days after deletion.
- Existing recoverable Trash receives a fresh 30-day grace period when the migration is applied; no existing item becomes immediately eligible.
- Restoring an item clears its purge deadline; trashing it again creates a new 30-day deadline.
- Trash lists expose the deadline and truthfully distinguish an enabled automatic purge from a disabled/dry-run rollout.
- A scheduled worker can report eligible items without deleting them and, only when explicitly enabled, permanently purge eligible content through the existing attachment-safe lifecycle operations.
- Manual permanent deletion remains available before the deadline with typed `delete` confirmation.
- Folder-batch ownership, separately trashed descendants, share revocation, attachment cleanup, and integration boundaries remain unchanged.
- Required migration, unit/integration, browser, type, formatting, build, and diff checks pass.

## Constraints and rollout gates

- Retention period is fixed at 30 days for this release; no per-user setting.
- Use explicit `purge_after` data rather than deriving eligibility solely from `deleted_at`.
- Automatic purge must default to `disabled` or `dry-run`; production deletion requires a separate explicit approval and configuration change.
- Do not deploy, apply production migrations, enable deletion mode, tag, or release from this branch.
- Do not expose Trash administration through harness, MCP, OAuth, API-key, or public-share surfaces.
- Do not change Markdown or canvas document formats.
- A failed attachment deletion must leave the item recoverable and eligible for a later retry.
- Worker runs must be bounded and safe under overlapping invocation.

## Proposed data model

Add nullable `purge_after` timestamp columns to `notes` and `folders`.

- Active rows: `purge_after = null`.
- Standalone Trash item: `deleted_at = now`, `purge_after = now + 30 days`, `trash_batch_id = null`.
- Folder batch: root, descendant folders, and included notes share one deletion time and purge deadline.
- Restore: clear `deleted_at`, `trash_batch_id`, and `purge_after` for restored rows.
- Manual or automatic purge: existing hard-delete lifecycle remains authoritative.
- Migration backfill: active rows stay null; every already-trashed row gets `migration time + 30 days`.

Add eligibility indexes suitable for bounded worker selection.

## Rollout configuration

Introduce `TRASH_AUTO_PURGE_MODE`:

- `disabled` — worker performs no candidate scan or deletion.
- `dry-run` — worker reports eligible standalone items and folder roots without deletion.
- `enabled` — worker permanently deletes eligible items through shared purge operations.

Default to `disabled`. Add bounded batch configuration, defaulting conservatively. The authenticated Trash response should expose only the user-relevant enabled state, not operational secrets.

UI language:

- Enabled: show the permanent-deletion date/countdown.
- Disabled or dry-run: show the eligibility date and clearly state automatic deletion is not active.

## Work package 1 — Schema and lifecycle deadlines

### Files to create

- `drizzle/0025_*.sql` and generated Drizzle metadata/snapshot.

### Files to modify

- `src/api/db/schema.ts`
- `src/api/trash/operations.ts`
- `tests/trash-policy.test.ts`
- `tests/trash-notes.test.ts`
- `tests/trash-folders.test.ts`

### Checklist

- [x] Add nullable note/folder `purge_after` columns and eligibility indexes.
- [x] Backfill existing trashed rows to a fresh 30-day deadline without affecting active rows.
- [x] Set one deadline atomically for standalone bulk Trash and folder batches.
- [x] Clear deadlines on standalone and folder-batch restoration.
- [x] Reset the deadline when restored content is trashed again.
- [x] Include `purgeAfter` in top-level Trash summaries and folder-batch inspection where appropriate.
- [x] Verify independently trashed descendants keep independent deadlines.

### Verification

- Generate and inspect migration SQL.
- Run migration coverage against active and pre-existing trashed fixtures.
- Run focused note/folder Trash lifecycle tests.
- Run Biome on changed TypeScript files and `pnpm typecheck`.

## Work package 2 — Bounded automatic purge worker

### Files to create

- `src/api/trash/cleanup.ts` — eligibility, dry-run reporting, and bounded purge orchestration.
- `src/api/trash/cleanup-handler.ts` — scheduled handler and structured summary logging.
- `tests/trash-retention.test.ts` — worker and rollout-mode coverage.

### Files to modify

- `sst.config.ts`
- `src/api/trash/operations.ts` only as needed to share safe purge behavior.

### Checklist

- [x] Parse mode and batch limit conservatively; invalid values fall back to disabled behavior.
- [x] Select only top-level standalone notes and folder-batch roots with `purge_after <= now`.
- [x] Process standalone notes before folder roots so references do not unnecessarily block eligible folder purges.
- [x] Reuse claimed permanent-delete operations and attachment cleanup rather than creating a second hard-delete path.
- [x] Continue after per-item failures and report scanned, eligible, deleted, skipped, and failed counts.
- [x] Ensure overlapping invocations cannot double-delete or partially purge one item.
- [x] Add a non-local daily SST Cron with database, storage, mode, and batch-limit configuration.
- [x] Keep production deletion mode off until separately approved.

### Verification

- Tests for disabled, dry-run, enabled, future deadline, exact cutoff, limits, concurrent/stale claims, attachment failure, folder batches, and independently trashed descendants.
- Handler test for structured results without production resources.
- SST/type/build checks.

## Work package 3 — Truthful retention UI and API contract

### Files to modify

- `src/api/routes/trash.ts`
- `src/frontend/lib/api.ts`
- `src/frontend/components/trash-table.tsx`
- `tests/browser/fixtures.ts`
- `tests/browser/trash.spec.ts`

### Checklist

- [x] Return `purgeAfter` for Trash entries and an authenticated automatic-purge-enabled flag.
- [x] Show an absolute deletion/eligibility date with understandable remaining-time text.
- [x] Use enabled language only when the worker is configured to delete.
- [x] Explain the 30-day policy without weakening manual typed-delete warnings.
- [x] Keep mobile layout and accessible status text intact.
- [x] Handle clock-expired entries that are waiting for the next worker run.

### Verification

- Browser coverage for enabled and disabled/dry-run wording, note rows, folder rows, expired deadlines, restore, and manual purge.
- Existing Trash browser suite remains green.

## Work package 4 — Documentation and rollout review

### Files to modify

- `docs/implementation/trash-and-recovery.md`
- `docs/implementation/README.md` only if a new cleanup component needs indexing.
- `.env.example` or deployment configuration documentation if present.
- `plan.md` status ledger during implementation.

### Checklist

- [x] Document the 30-day deadline, migration grace period, modes, retry behavior, and manual deletion.
- [x] Document that revoked shares remain revoked and integrations still cannot administer Trash.
- [x] Record dry-run observability and the explicit production enablement gate.
- [ ] Review dry-run output and candidate counts before recommending enablement.
- [ ] Update `MinuNotes — Unreleased` only after implementation approval.

## Final verification

- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck`
- `pnpm --dir packages/mcp typecheck` when shared contracts affect MCP compilation
- `pnpm test`
- Relevant full/targeted Playwright Trash suite
- `pnpm build`
- `pnpm db:generate` and generated SQL review
- Local migration against active and already-trashed fixtures
- `git diff --check`

## Expected file inventory

### New

- Generated `drizzle/0025_*.sql` and metadata
- `src/api/trash/cleanup.ts`
- `src/api/trash/cleanup-handler.ts`
- `tests/trash-retention.test.ts`

### Modified

- `src/api/db/schema.ts`
- `src/api/trash/operations.ts`
- `src/api/routes/trash.ts`
- `sst.config.ts`
- `src/frontend/lib/api.ts`
- `src/frontend/components/trash-table.tsx`
- `tests/trash-policy.test.ts`
- `tests/trash-notes.test.ts`
- `tests/trash-folders.test.ts`
- `tests/browser/fixtures.ts`
- `tests/browser/trash.spec.ts`
- `docs/implementation/trash-and-recovery.md`
- Deployment environment example/documentation if applicable
- `plan.md`

## Approval status

- [x] Branch created: `feat/trash-retention`.
- [x] Existing Trash purge and scheduled attachment-cleanup patterns inspected.
- [x] Plan approved.
- [x] Implementation started.
- [ ] Dry-run rollout reviewed.
- [ ] Production automatic deletion explicitly approved.


## Implementation status

- Code complete and ready for review on `feat/trash-retention`.
- Migration `0025_closed_brother_voodoo.sql` adds deadlines and gives existing Trash a fresh 30-day grace period.
- Automatic purge remains disabled by default; no production migration, deployment, or retention enablement was performed.
- Verification: Biome changed-file checks passed with existing warnings only; root typecheck passed; 207 unit/integration tests passed; focused retention and Trash tests passed; 16 targeted Trash browser tests passed; production build passed with the existing large-chunk warning; local migration applied successfully; `pnpm db:generate` reports no remaining schema changes.
- Remaining human gates: review the implementation, deploy in disabled/dry-run mode only after approval, evaluate candidate reports, and separately approve `enabled` mode.
