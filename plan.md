# Active Plan — Graph Discovery Performance

## Status

**Approved for Phase 0 measurement. No production behavior changes are approved yet.**

## Goal

Make orphan, outgoing-link, and backlink discovery scale predictably with note and link volume while preserving authorization, private-folder, Trash, unresolved-link, folder-masking, ordering, pagination, and API response behavior.

## Delivery strategy

Each phase is independently reviewed before committing or continuing. Establish evidence first; do not add pagination, limits, indexes, or authorization changes until the baseline identifies a material bottleneck.

## Expected files

- `plan.md`
- `scripts/benchmark-graph-discovery.ts`
- `package.json`
- `docs/implementation/graph-discovery-performance.md`
- `docs/implementation/README.md`
- `src/api/notes/links.ts` only after benchmark review
- `src/api/routes/notes.ts` and `src/api/routes/harness.ts` only if result shaping or batching changes
- `src/api/lib/collaboration-access.ts` only if existing batch access helpers cannot preserve current behavior
- Focused tests under `tests/` for any approved production change
- Drizzle schema and a new migration only if query-plan evidence justifies an index

## Phase 0 — Reproducible baseline

### Work

- [x] Add deterministic 100-, 1,000-, and 10,000-note graph fixtures with configurable sparse/dense authored links.
- [x] Measure owner and collaborator orphan discovery separately.
- [x] Measure outgoing links and backlinks at small and 1,000-link per-note counts.
- [x] Record warm median/p95 latency, logical database calls, response/result counts, and query plans.
- [x] Identify full candidate loading, large `IN` sets, recursive authorization, in-memory filtering, per-result access checks, and unbounded link payloads as the current costs.

### Verification

- [x] Run dense and sparse benchmark profiles and confirm deterministic result counts.
- [x] Run Biome and `pnpm typecheck` for benchmark/documentation changes.
- [x] Verify timings and call counts through production internal note routes; use representative SQL only for `EXPLAIN QUERY PLAN` output.

### Review gate

Review baseline methodology and evidence before changing production graph discovery.

## Phase 1 — Bound orphan discovery

- [x] Replace full candidate loading with adaptive bounded batches after Phase 0 showed material near-linear growth.
- [x] Authorize candidate notes and incoming source notes before pagination or `hasMore` decisions.
- [x] Preserve the current definition: a note is orphaned when no accessible active source note links to it.
- [x] Preserve title/ID order, internal page behavior, harness cursor behavior, integration scopes, and direct-note folder masking.
- [x] Add internal offset and harness cursor coverage beyond the 250-candidate boundary; retain existing inaccessible-source, Trash, private-folder, and shared-grant tests.
- [x] Reduce 10,000-note sparse first-page p95 from 103.66 ms to 28.77 ms for owners and from 123.05 ms to 23.91 ms for collaborators.
- [x] Run Biome, typecheck, focused graph/collaboration tests, and sparse/dense benchmarks.

## Phase 2 — Bound links and backlinks

- [x] Batch harness target/source access checks after measuring roughly 3,000 calls for 999 links.
- [x] Keep limits and pagination deferred to an explicit compatibility review; response shapes remain unchanged.
- [x] Preserve unresolved wikilink titles, hidden canvas target labels, inaccessible-target nulling, inaccessible-source exclusion, and source-folder masking.
- [x] Add a 501-result access-chunk boundary test and retain existing mixed-access privacy coverage.
- [x] Reduce 999-link harness outgoing p95 from 363.62 ms to 17.66 ms and backlink p95 from 321.87 ms to 15.55 ms.
- [x] Reduce logical calls from about 3,000 to 11–12, plus one compact resource query for each additional 500 unique IDs.

## Phase 3 — Remaining shared-folder detail work

- [ ] Profile serial ancestor reads and per-child trash eligibility after graph work.
- [ ] Batch only if the measured page-load cost remains material after the recently merged page-load improvements.

## Safety boundaries

- [ ] Never limit link candidates before authorization when doing so could omit accessible results.
- [ ] Never expose inaccessible note IDs, titles, labels, folders, owners, counts, or pagination effects.
- [ ] Keep point-operation authorization authoritative; discovery results are not reusable capabilities.
- [ ] Do not weaken active-folder hierarchy, Trash, integration scope, or selected-grant checks.
- [ ] Keep ordinary offset and harness cursor contracts unchanged unless separately approved.

---

# Active Plan — Search Performance and Indexing

## Status

**Approved. Phases 0–4 are committed and reviewed. Phase 5 measurement and design are awaiting a separately approved implementation plan.**

## Goal

Make note search fast and predictable as note volume grows while preserving the current authorization, privacy, trash, ranking, and result-shaping behavior. Security simplification is explicitly deferred until search improvements are measured and verified.

## Delivery strategy

Each phase is a separate review checkpoint. Do not begin the next phase until the current phase's diff, tests, and measurements have been reviewed and approved. Prefer separate commits per phase so any optimization can be evaluated or reverted independently.

## Baseline files expected to change

- `plan.md`
- `src/frontend/components/search-dialog.tsx`
- `src/frontend/lib/api.ts`
- `src/api/harness/commands.ts`
- `src/api/routes/notes.ts`
- `src/api/lib/collaboration-access.ts` only if a batch resolver is required; do not weaken access rules
- `src/api/db/schema.ts` if typed search-index metadata is needed
- `drizzle/0038_*.sql`
- New focused search benchmark/test fixtures under `scripts/` and `tests/`
- Existing authorization, collaboration, pagination, trash, and line-search tests as required

The exact migration filename will be generated by Drizzle. Avoid unrelated cleanup in these files.

## Phase 0 — Establish a measurable baseline

### Work

- [x] Add a reproducible benchmark fixture with small, 1,000-note, and 10,000-note datasets, including representative large Markdown notes.
- [x] Measure first-run and warm searches for exact-title, prefix-title, rare-body, and common-body terms.
- [x] Record database-call count, elapsed time, candidate/result count, and response size.
- [x] Cover owned-only and mixed owned/shared discovery scopes.
- [x] Capture `EXPLAIN QUERY PLAN` evidence for the current search query.
- [x] Define acceptance thresholds before optimizing: bounded database calls in Phase 1, local 10,000-note p95 below 50 ms after indexing, and observed production p95 below 300 ms after controlled rollout.

### Verification

- [x] Benchmark runs locally without modifying `local.db`.
- [x] Fixture generation is deterministic and cleans up temporary data.
- [x] Baseline results and acceptance criteria are recorded in `docs/implementation/search-performance.md`.

### Review gate

Review the benchmark shape, baseline evidence, and targets before Phase 1.

## Phase 1 — Remove avoidable request and query amplification

### Work

- [x] Replace per-result `resolveNoteCollaborationAccess` calls in search serialization with one bounded/batched access-resolution path.
- [x] Do not load note content merely to serialize search metadata.
- [x] Preserve direct-note grant behavior that hides folder context.
- [x] Preserve owner identity and effective collaboration-role output.
- [x] Debounce interactive search by approximately 250 ms.
- [x] Propagate React Query's abort signal through `api.searchNotes` to `fetch` so superseded searches are cancelled.
- [x] Reduce the initial dialog result limit from 50 to 20.
- [x] Limit API search queries to 200 characters while preserving valid short searches.

### Expected files

- `src/api/routes/notes.ts`
- `src/api/lib/collaboration-access.ts`
- `src/frontend/components/search-dialog.tsx`
- `src/frontend/lib/api.ts`
- Focused API/unit/browser tests

### Verification

- [x] Owned, folder-shared, and direct-note-shared results remain privacy-safe.
- [x] Trashed notes and notes below trashed folders remain absent.
- [x] Query count is reduced from 41 to 1 for owned results and from 46 to 4 for mixed results in the benchmark fixture.
- [x] Browser coverage verifies rapid typing issues only the final debounced request; superseded queries receive React Query's abort signal.
- [x] Run Biome on changed files, `pnpm typecheck`, focused tests, focused browser tests, and the Phase 0 benchmark.

### Review gate

Review the complete Phase 1 diff and before/after measurements before adding FTS.

## Phase 2 — Validate the FTS design before committing to a migration

### Work

- [x] Verify local libSQL and the configured production Turso database expose FTS5; require a development-Turso migration check before rollout.
- [x] Compare standard token/prefix search with trigram-backed substring search against current MinuNotes expectations.
- [x] Decide and document handling for one- and two-character queries.
- [x] Propose compact `unicode61` title/body indexing while retaining relational exact/prefix/substring ranking for title, tags, and folder metadata.
- [x] Extract user-visible canvas node/edge text rather than indexing raw canvas JSON.
- [x] Keep versions, comments, attachment binaries, and raw canvas metadata outside the initial index.
- [x] Define bounded backfill, trigger-based incremental synchronization, migration rollback, and index-rebuild behavior.
- [x] Require authorization and trash filtering before returning records, snippets, or counts from indexed candidates.

### Expected artifact

- [x] `docs/implementation/search-performance.md` records measured prototype results and the proposed schema/query strategy.

### Review gate

Explicit approval of tokenizer semantics, indexed content, storage cost, and synchronization strategy before Phase 3.

## Phase 3 — Add indexed search behind the existing API contract

### Work

- [x] Add migration `0038_brave_the_spike.sql` with deterministic server-side backfill.
- [x] Keep the index synchronized for create, title/content/document-type update, restore, and permanent deletion operations through database triggers.
- [x] Retain relational folder/tag search, so those changes require no FTS reindex in the approved design.
- [x] Add idempotent verification and atomic rebuild behavior through `scripts/rebuild-search-index.ts`.
- [x] Retrieve title/body candidates through an uncorrelated FTS subquery, then apply current authorization and active/trash rules before returning compact metadata.
- [x] Preserve exact-title and prefix-title ranking while documenting the approved body token/prefix semantic change.
- [x] Keep the current search endpoint contract stable.
- [x] Retain an explicit release rollback path without silently falling back to an unbounded body scan.

### Expected files

- `drizzle/0038_*.sql`
- `src/api/db/schema.ts` if needed
- `src/api/harness/commands.ts`
- Search index synchronization/rebuild helper(s)
- Migration, correctness, and performance tests

### Verification

- [x] Fresh migration-runner and populated-database tests cover empty and populated databases.
- [x] Backfill and rebuild produce equivalent searchable records and matching source/mapping/index counts.
- [x] Trigger and existing version/trash tests cover create, update, restore, trash/restore, document-type changes, malformed canvas content, and permanent deletion behavior.
- [x] Existing collaboration, integration authorization, trash, pagination, and search tests pass with explicit body-prefix/body-infix expectations.
- [x] 1,000- and 10,000-note benchmarks meet the approved 50 ms local p95 threshold for the standard 2 KB fixture.
- [x] Run Biome on changed files, `pnpm typecheck`, focused tests, all 403 unit/integration tests, `pnpm build`, and an atomic migration-runner smoke test.

### Review gate

Review migration safety, search semantics, storage growth, and benchmark evidence before rollout.

## Phase 4 — Optimize cross-note line search

### Work

- [x] Preserve arbitrary substring semantics with bounded relational body candidates instead of using token-only FTS candidates that could create false negatives.
- [x] Fetch at most 25 candidate note bodies per call and stop when `limit + 1` matches are satisfied.
- [x] Add an ordered active-note index so common matches can stop without sorting/loading every candidate body.
- [x] Batch integration access metadata for harness note and line results while preserving private-folder, selected-grant, role, and direct-note masking rules.
- [x] Preserve line numbers, columns, context, case-sensitivity behavior, cursor behavior, and privacy-safe metadata.

### Verification

- [x] Existing line-search, integration authorization, privacy, and harness pagination tests pass.
- [x] Add common-term, rare-term, title-only, and 10,000-note benchmark coverage.
- [x] Add cursor coverage across more than one 25-note candidate batch.
- [x] Confirm selected content stays bounded by candidate batch size and common-term p95 drops from 63.57 ms to 0.88 ms locally.
- [x] Run final Biome, `pnpm typecheck`, all 404 unit/integration tests, production build, focused authorization tests, and atomic migration-runner smoke verification.

### Review gate

Review independently from interactive search because this changes agent/harness behavior.

## Deferred follow-up — Advanced search filters and result formats

Begin only after indexed search and cross-note line search are complete and reviewed.

- [ ] Label note results by Format using the existing `documentType`: Markdown, Canvas, or Mind map.
- [ ] Add All/Markdown/Canvas/Mind map filtering, optionally grouping both canvas formats under Canvases initially.
- [ ] Add Updated date presets and a timezone-safe custom range using inclusive start and exclusive end bounds.
- [ ] Keep Created date filtering deferred until user need is established.
- [ ] Apply format/date filters to joined note metadata rather than FTS text.
- [ ] Include filters in API validation, query-cache keys, cursor scope, OpenAPI, benchmarks, and authorization/privacy coverage.
- [ ] Add ordinary metadata indexes only when query-plan measurements justify them.

Detailed constraints are recorded in `docs/implementation/search-performance.md`.

## Phase 5 — Re-evaluate authorization complexity without changing it yet

### Work

- [ ] Profile recursive CTE, folder-tree, global FTS posting-list, and temporary ranking-sort costs after FTS has reduced source-body work.
- [ ] Identify checks duplicated between discovery SQL and result serialization.
- [ ] Compare request-scoped accessible folder/note IDs, flattened/materialized folder state, and the current recursive model with measured evidence.
- [ ] Prototype deterministic early-stop ranking buckets that preserve cursor semantics and deduplicate notes across exact-title, prefix, substring, tag, folder, and body matches.
- [ ] Evaluate tenant-aware FTS filtering only if production measurements show global common-term posting lists are material; include shared-owner and privacy analysis.
- [ ] Do not cap candidates before authorization or expose inaccessible counts, snippets, titles, or owner identifiers.
- [ ] Consider caching only after access scopes have safe keys and invalidation rules.
- [ ] Document which checks are authoritative for point operations versus discovery operations.
- [ ] Propose simplifications only when existing authorization tests prove equivalent behavior.

### Explicit boundary

- [ ] No security-model simplification is part of Phases 0–4.
- [ ] Any Phase 5 implementation requires a new approved plan and separate review branch or clearly isolated commits.

## Overall success criteria

- Search latency scales with indexed matches rather than total note-body volume.
- Interactive typing does not create overlapping unbounded searches.
- Database-call count does not grow linearly with returned results.
- Search never returns inaccessible, private, or trashed resources.
- Search storage and write amplification are measured and accepted.
- Every phase has an independently reviewable diff and evidence summary.

## Approval requested

Approve or revise:

1. The branch and six-phase review sequence (Phases 0–5).
2. Phase 0's local post-indexing p95 target of 50 ms at 10,000 notes and observed production target of 300 ms.
3. Phase 1's 250 ms debounce and 20-result initial limit.
4. The requirement for a separate FTS design approval before migration work.
5. Deferring all authorization simplification until after indexed search is measured.

---

# Active Plan — Preserve Conflicting Note Drafts

## Status

**Approved, implemented, and verified.**

## Goal

Prevent a user’s conflicting local note edits from being lost through modal dismissal, page refresh, or navigation while keeping stale server writes rejected by the existing content-hash protection.

## Scope and files

- [x] `src/frontend/routes/notes.$noteId.tsx`
  - Persist a conflict draft for the current browser tab so refresh/navigation does not erase it.
  - Restore a preserved draft when the note route hydrates.
  - Replace the ambiguous `Dismiss` action with an explicitly destructive `Discard local draft…` flow.
  - Make closing review non-destructive.
  - Expand conflict review and show the local draft beside the latest saved server version.
  - Clear preserved data only after explicit discard or when the server already contains the attempted draft.
- [x] `tests/browser/note-editor.spec.ts`
  - Extend the save-race regression test to cover side-by-side review.
  - Verify closing review preserves the draft.
  - Verify refresh/navigation restores the draft.
  - Verify discard requires explicit confirmation and removes only the preserved draft.
- [x] `docs/implementation/stale-document-detection.md`
  - Document the revised preservation, review, and discard behavior.

## Explicitly out of scope

- Automatic three-way merging.
- Real-time collaboration, WebSockets, or presence.
- Backend/schema changes; stale writes already return `409 Conflict` correctly.
- Automatically applying a local draft over the latest server version.

## Verification

- [x] Run `pnpm exec biome check --write src/frontend/routes/notes.$noteId.tsx tests/browser/note-editor.spec.ts`.
- [x] Run the focused Playwright note-editor test.
- [x] Run `pnpm typecheck`.
- [x] Confirm through browser regression coverage that closing review does not discard text and only the explicit discard flow removes it.

---

# Central Minuscule Labs Documentation Plan

## Status

**Approved. Phases 1–2 are implemented and verified; Phase 3 has not started.**

## Goal

Publish a unified Starlight site at `https://docs.minusculelabs.com` while keeping each project's public documentation beside the code and release it describes.

Target URLs:

- `https://docs.minusculelabs.com/`
- `https://docs.minusculelabs.com/minunotes/`
- `https://docs.minusculelabs.com/minueditor/`
- `https://docs.minusculelabs.com/minucanvas/`

## Core architecture

### Product repositories own content

Each product remains the source of truth for its public and private documentation:

```text
minunotes/
  docs/public/           # Published product and integration guides
  docs/implementation/   # Private engineering documentation

minueditor/
  docs/public/
  docs/implementation/

minucanvas/
  docs/public/
  docs/implementation/
```

Public documentation changes with the feature PR that changes product behavior. Internal implementation, security, planning, and deployment documents are never imported into the public site.

### `minuscule-docs` owns presentation and assembly

A dedicated sibling repository owns:

- Astro/Starlight configuration
- Shared Minuscule Labs docs branding
- Central project directory
- Project switcher and global navigation
- Content assembly tooling
- Link/frontmatter validation
- Deployment to `docs.minusculelabs.com`

It does not become the manual source of truth for product guides.

## Version and release synchronization

### MinuNotes

- Build published docs from the exact Git SHA successfully deployed to production.
- A successful production deployment triggers the docs assembly workflow with that SHA.
- Editorial docs-only deployments may reuse the current production SHA.

### Libraries

- Build MinuEditor and MinuCanvas documentation from their latest stable release tags.
- Do not publish unreleased `main` behavior as current documentation.
- Documentation versioning is deferred, but the source tag/SHA is retained in build metadata.

### Central manifest

The docs repository maintains a machine-readable manifest similar to:

```json
{
  "projects": [
    {
      "slug": "minunotes",
      "repository": "spdydve/minunotes",
      "contentPath": "docs/public",
      "ref": "<production-sha>"
    },
    {
      "slug": "minueditor",
      "repository": "spdydve/minueditor",
      "contentPath": "docs/public",
      "ref": "<stable-tag>"
    },
    {
      "slug": "minucanvas",
      "repository": "spdydve/minucanvas",
      "contentPath": "docs/public",
      "ref": "<stable-tag>"
    }
  ]
}
```

The assembled Starlight content directory is generated during builds and ignored by Git. Public prose is never manually duplicated into both the product and central repositories.

## Public information architecture

```text
/
  Minuscule Labs project directory

/minunotes/
/minunotes/getting-started/
/minunotes/write/*
/minunotes/organize/*
/minunotes/collaborate/*
/minunotes/recover/*
/minunotes/integrations/*

/minueditor/
/minueditor/getting-started/*
/minueditor/configuration/*
/minueditor/extensions/*
/minueditor/api/*

/minucanvas/
/minucanvas/getting-started/*
/minucanvas/configuration/*
/minucanvas/api/*
```

Only verified content is published. MinuEditor and MinuCanvas receive overview pages until their source repositories provide deeper public guides.

## Phase 1 — Prepare MinuNotes public content

Work remains on `feat/public-resources-onboarding`.

- [x] Create `docs/public/minunotes/` with Starlight-compatible Markdown/MDX and assets.
- [x] Move the 19 public guides written on this branch into task-based directories.
- [x] Add valid Starlight frontmatter: title, description, sidebar order, and advanced labels where needed.
- [x] Remove duplicated “Continue learning” sections where Starlight navigation already provides the path.
- [x] Isolate Manual integration testing under Advanced integrations.
- [x] Audit content for internal-only language, localhost assumptions, and implementation details.
- [x] Preserve the task-oriented Getting Started guide.
- [x] Document the transitional `/resources/<slug>` link convention for assembler mapping to `/minunotes/`.
- [x] Keep `docs/implementation/`, runbooks, plans, and security reviews outside `docs/public/`.
- [x] Add a public-doc validation script for frontmatter, links, duplicate slugs, and forbidden private paths.

Expected MinuNotes files:

- Create `docs/public/minunotes/index.mdx`.
- Create `docs/public/minunotes/getting-started.mdx`.
- Create directories for `write`, `organize`, `collaborate`, `recover`, and `integrations`.
- Create `scripts/validate-public-docs.ts` or equivalent.
- Add a `docs:validate` package script.
- Add tests for content boundaries and links.

## Phase 2 — Bootstrap `minuscule-docs`

Create a dedicated sibling repository at `../minuscule-docs`.

- [x] Initialize a pnpm Astro/Starlight project.
- [x] Configure `site: 'https://docs.minusculelabs.com'`.
- [x] Add shared Minuscule Labs styling, light/dark themes, social links, and accessible navigation.
- [x] Create the central project-directory homepage.
- [x] Create honest MinuEditor and MinuCanvas overview fallbacks.
- [x] Add a typed project manifest schema.
- [x] Add scripts to fetch project repositories at explicit refs.
- [x] Import only each manifest entry's configured public content path.
- [x] Rewrite or validate project-root-relative links for the mounted project prefix.
- [x] Copy verified public assets without crossing directory boundaries.
- [x] Record source repository and ref in generated build metadata.
- [x] Ignore generated assembled content.

Expected docs-site files:

- `package.json`
- `pnpm-lock.yaml`
- `astro.config.mjs`
- `tsconfig.json`
- `src/content.config.ts`
- `src/content/docs/index.mdx`
- `src/styles/custom.css`
- `projects.json`
- `scripts/assemble-docs.ts`
- `scripts/validate-docs.ts`
- tests for manifest and assembly boundaries

## Phase 3 — Central deployment

Deploy independently from the `minuscule-docs` repository.

- [ ] Add an SST `StaticSite` for `docs.minusculelabs.com`.
- [ ] Use externally managed DNS with `dns: false`.
- [ ] Require `DOCS_CERT_ARN` for non-local custom-domain deployment.
- [ ] Document the CloudFront target and DNS record setup.
- [ ] Add local, development, and production build/deploy scripts.
- [ ] Ensure direct deep links, clean URLs, 404 pages, assets, sitemap, and canonical URLs work.
- [ ] Add a CI workflow that assembles, validates, builds, and deploys.
- [ ] Accept a product slug and source SHA/tag from trusted release dispatch events.
- [ ] Prevent untrusted repository-dispatch payloads from deploying arbitrary refs.

## Phase 4 — Product release integration

### MinuNotes

- [ ] Extend the successful production release workflow to dispatch the deployed SHA to `minuscule-docs`.
- [ ] Keep docs deployment failure visible without rolling back an otherwise healthy application automatically.
- [ ] Record the docs deployment URL/status in the release record.
- [ ] Add a PR “Documentation impact” field or checklist.
- [ ] Require `docs/public` updates for user-visible changes or an explicit “no docs change” explanation.

### MinuEditor and MinuCanvas

- [ ] Add the same dispatch only after their repositories have stable public-doc directories.
- [ ] Dispatch stable release tags, not arbitrary branch heads.
- [ ] Generate API references from TypeDoc or another source artifact later instead of copying signatures manually.

## Phase 5 — Integrate central docs into MinuNotes

After `docs.minusculelabs.com` is deployable:

- [ ] Remove the custom public Resources shell, registry, metadata helper, and resource-only app styling introduced on this branch.
- [ ] Remove duplicate in-app MDX after content is safely present under `docs/public/minunotes`.
- [ ] Point the sign-in prompt to `https://docs.minusculelabs.com/minunotes/`.
- [ ] Point authenticated Resources navigation to the same central site.
- [ ] Preserve `/resources` and `/resources/:slug` as redirects.
- [ ] Add a complete old-slug-to-new-path map.
- [ ] Make the docs origin configurable with `VITE_DOCS_URL`, defaulting to the production docs origin.
- [ ] Expose `VITE_DOCS_URL` through SST environments.

Expected MinuNotes files:

- Modify `src/frontend/routes/auth.tsx`.
- Modify resource navigation handling and legacy resource routes.
- Modify `.env.example`.
- Modify `sst.config.ts`.
- Remove superseded custom public-resource components and helpers.
- Update unit and browser tests.

## CI and safety checks

### Product repositories

- [ ] Validate frontmatter and unique slugs.
- [ ] Validate internal links and referenced assets.
- [ ] Reject links into private implementation directories.
- [ ] Reject accidental secrets and environment files from public content.
- [ ] Ensure public docs changed, or were explicitly considered, for user-visible PRs.

### Central docs repository

- [ ] Validate manifest entries and explicit refs.
- [ ] Restrict imports to configured public content roots.
- [ ] Fail on broken cross-project links.
- [ ] Fail on duplicate mounted paths.
- [ ] Confirm canonical URLs and sitemap use `docs.minusculelabs.com`.
- [ ] Test representative direct links for every project.
- [ ] Test mobile/desktop navigation and light/dark themes.
- [ ] Confirm private project documentation is absent from build output.

## Verification

### MinuNotes

- [ ] Run Biome on changed files.
- [ ] Run `pnpm typecheck`.
- [ ] Run public-doc validation tests.
- [ ] Run focused navigation and redirect browser tests.
- [ ] Run `pnpm build`.

### `minuscule-docs`

- [ ] Run formatter/linter.
- [ ] Run Astro/Starlight type checks.
- [ ] Run manifest and assembly tests.
- [ ] Run link validation.
- [ ] Run production build.
- [ ] Inspect generated routes and sitemap.

## Explicitly deferred

- Detailed MinuEditor and MinuCanvas guides not yet owned by those repositories.
- Multiple published documentation versions.
- Localization.
- Private/authenticated documentation.
- Broad marketing content for `minusculelabs.com`.
- Automated TypeDoc/OpenAPI page generation beyond preserving current verified references.

## Approval decisions

Approve or change these defaults before implementation:

1. **Content ownership:** public docs remain in each product repository under `docs/public`; no manually duplicated product prose in `minuscule-docs`.
2. **Central ownership:** `minuscule-docs` owns Starlight presentation, assembly, validation, and deployment only.
3. **Published refs:** MinuNotes uses the deployed production SHA; libraries use stable release tags.
4. **Initial scope:** fully migrate MinuNotes; provide verified overview fallbacks for MinuEditor and MinuCanvas.
5. **Rollout order:** deploy the central docs site before replacing MinuNotes Resources with redirects.
6. **Remote setup:** implement the sibling repository locally first, then attach its GitHub remote when identified or created.
