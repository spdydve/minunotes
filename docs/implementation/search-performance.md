# Search performance

## Scope

This document records the reproducible baseline and acceptance criteria for the phased search-performance work on `perf/search-indexing-phases`. It is not an authorization redesign.

## Benchmark

Run:

```bash
pnpm benchmark:search
```

Optional controls:

```bash
pnpm benchmark:search --sizes=100,1000,10000 --iterations=7 --content-bytes=2048
```

The benchmark:

- creates and removes a temporary libSQL database;
- applies all production migrations;
- generates deterministic owned and folder-shared Markdown notes;
- leaves `local.db` unchanged;
- measures first-run, warm median, and warm p95 endpoint latency;
- counts logical libSQL calls made by the search endpoint;
- records response size and result count; and
- captures `EXPLAIN QUERY PLAN` for the current owned-note search shape.

The local benchmark is useful for comparisons, not a substitute for production latency measurements against remote Turso.

## Phase 0 baseline

Environment: local file-backed libSQL, 7 warm iterations per case, 2,048 bytes of content per note. The dialog-equivalent result limit is 20.

| Notes | Case | Warm p50 | Warm p95 | DB calls | Results |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Exact title, owned | 1.33 ms | 1.71 ms | 3 | 1 |
| 100 | Common body, owned | 5.31 ms | 5.55 ms | 41 | 20 |
| 100 | Common body, owned + shared | 6.24 ms | 6.89 ms | 46 | 20 |
| 1,000 | Exact title, owned | 4.33 ms | 4.81 ms | 3 | 1 |
| 1,000 | Common body, owned | 9.97 ms | 13.20 ms | 41 | 20 |
| 1,000 | Common body, owned + shared | 9.94 ms | 10.53 ms | 46 | 20 |
| 10,000 | Exact title, owned | 38.29 ms | 54.49 ms | 3 | 1 |
| 10,000 | Prefix title, owned | 31.03 ms | 32.74 ms | 41 | 20 |
| 10,000 | Rare body, owned | 32.94 ms | 42.63 ms | 3 | 1 |
| 10,000 | Common body, owned | 36.69 ms | 39.29 ms | 41 | 20 |
| 10,000 | Common body, owned + shared | 50.59 ms | 57.28 ms | 46 | 20 |

The results establish two independent scaling problems:

1. Exact-title and rare-body searches still grow with total note volume, demonstrating the unindexed scan.
2. Returning 20 owned results takes 41 logical database calls; mixed owned/shared results take 46. Call count grows with result count and remote database latency will amplify it.

The captured query plan includes:

- a scan/search across candidate folders and notes;
- correlated recursive folder-path subqueries;
- correlated tag lookups; and
- a temporary B-tree for ranking and ordering.

## Phase 1 results

Phase 1 batches discovery access resolution and removes per-result note and folder-tree reads. The same benchmark now records one logical database call for owned searches and four for mixed owned/shared searches, independent of the 20-result page size.

| Notes | Case | Warm p50 | Warm p95 | DB calls | Results |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Common body, owned | 0.90 ms | 0.91 ms | 1 | 20 |
| 100 | Common body, owned + shared | 1.37 ms | 1.41 ms | 4 | 20 |
| 1,000 | Common body, owned | 3.65 ms | 3.81 ms | 1 | 20 |
| 1,000 | Common body, owned + shared | 5.18 ms | 5.51 ms | 4 | 20 |
| 10,000 | Exact title, owned | 36.16 ms | 36.65 ms | 1 | 1 |
| 10,000 | Rare body, owned | 32.43 ms | 33.01 ms | 1 | 1 |
| 10,000 | Common body, owned | 32.37 ms | 34.59 ms | 1 | 20 |
| 10,000 | Common body, owned + shared | 44.05 ms | 45.02 ms | 4 | 20 |

The N+1 cost is removed, but exact-title and rare-body latency still grows with total note volume. That remaining scan is the indexed-search problem addressed by Phases 2–3.

## Phase 2 FTS design prototype

Run the isolated prototype with:

```bash
pnpm prototype:search-fts
```

It creates a temporary libSQL database, generates 10,000 deterministic 2 KB notes, compares `unicode61` and trigram FTS5 indexes, reports object-level storage through `dbstat`, and removes the database afterward.

### Capability

- Local `@libsql/client`: SQLite 3.45.1 with FTS5, `fts5vocab`, `unicode61`, and trigram tokenizer support.
- Configured production Turso database: SQLite 3.47.0 with FTS5 and `fts5vocab` registered.
- No production schema or data was modified during the capability check.
- The migration must still be exercised against development Turso before production rollout.

### Prototype results

The fixture contains 20.48 MB of raw body text. SQLite allocates 41.05 MB to the source table because 2 KB rows leave page-level free space.

| Index | Build time | Index bytes | Relative to raw body | Relative to source table |
| --- | ---: | ---: | ---: | ---: |
| `unicode61`, title + full body | 71.94 ms | 3.39 MB | 16.6% | 8.3% |
| Trigram, title + full body | 599.99 ms | 26.41 MB | 128.9% | 64.3% |
| Trigram, title only | 25.18 ms | 0.95 MB | 4.6% | 2.3% |

Representative warm results:

| Search | Warm p95 | Results |
| --- | ---: | ---: |
| Existing rare-body `LIKE` scan | 50.322 ms | 1 |
| `unicode61` whole token | 0.052 ms | 20 |
| `unicode61` token prefix | 0.265 ms | 20 |
| Full trigram rare body | 0.538 ms | 1 |
| Full trigram infix | 0.056 ms | 20 |
| Trigram two-character query | 0.074 ms | 0 |
| Title-only trigram infix | 0.045 ms | 20 |

Absolute timings vary, but the storage and semantic differences are clear:

- `unicode61` is compact and behaves like conventional word/prefix search.
- Full trigram preserves body infix matching for queries of at least three characters, but its index is much larger and slower to build.
- Trigram cannot satisfy one- or two-character `MATCH` queries.

### Proposed decision

Use a compact `unicode61` contentless FTS5 index for note titles and searchable body text. Do not use a full-content trigram index.

Preserve current metadata substring behavior with the existing relational checks for title, folder title, and tags. The query should form candidates from two branches:

1. FTS title/body token or token-prefix matches.
2. Existing title/folder/tag substring matches over short metadata fields.

Join the combined candidate IDs back to `notes`, then apply the current authorization, trash, type, tag, ranking, and pagination rules. FTS must never return snippets, counts, or records before authorization filtering.

This deliberately changes body search from arbitrary character substring matching to literal word/prefix matching. For example, `performance` and `perfor` find the word “performance,” while `forman` does not. One- and two-character searches remain supported as literal FTS tokens and metadata substrings, but do not match characters embedded inside every body word.

Treat user input as literal text, not raw FTS query syntax. Escape quotes/operators and construct phrase/prefix expressions server-side.

### Indexed content

- Markdown: index the full Markdown string with `unicode61`; punctuation is tokenized away while prose and code identifiers remain searchable.
- Canvas: index only user-visible node text/labels and visible edge labels extracted from valid canvas JSON. Do not index coordinates, internal IDs, URLs, or raw JSON keys.
- Title: include in FTS for token matching and retain relational title checks for exact/prefix/substring ranking.
- Tags and folder title/path: retain relational search initially. Revisit indexing only if metadata scans become measurable.
- Exclude versions, comments, attachment binaries, and non-visible canvas metadata.

### Proposed storage and synchronization

Use a stable integer mapping table from note ID to FTS row ID. Do not rely on the implicit `notes.rowid`, which can change because the table uses a text primary key.

Use a contentless FTS5 table so source Markdown is not stored a second time. Database triggers should synchronize insert, title/content/document-type update, and permanent deletion. The canvas trigger expression should extract visible text with SQLite JSON functions and safely produce empty body text for malformed canvas JSON. Add an idempotent verification/rebuild command for backfill and recovery.

Folder and tag changes do not require FTS updates in this first design because they remain relational search branches. Trash and restore do not rewrite FTS; active/trash filtering remains authoritative in the joined notes query.

### Rollout and rollback

1. Validate FTS and JSON expressions against development Turso.
2. Create mapping and FTS tables with triggers.
3. Backfill in bounded batches and verify mapping/index counts.
4. Deploy the indexed query only after backfill verification.
5. Keep the old query available only as an explicit rollback release, not as an automatic production fallback that could restore unbounded scans.
6. Roll back application reads before dropping index structures; index tables contain derived data only.

## Deferred advanced search filters

Implement advanced filters only after indexed search and line search are complete and measured. Do not expand the FTS migration to include this UI work.

Use **Format** for the user-facing distinction represented by `notes.documentType`:

- Markdown (`markdown`)
- Canvas (`canvas.default`)
- Mind map (`canvas.mindmap`)

Keep this separate from `notes.type`, which distinguishes notes from templates, and from the search result kind, which distinguishes folders from notes.

The follow-up should:

- display a subtle format icon or label on every note search result;
- support All, Markdown, Canvas, and Mind map filters, with an option to group both canvas formats under Canvases initially;
- add an Updated date filter with Today, 7 days, 30 days, one year, and a custom range;
- defer Created date filtering until there is a demonstrated need;
- represent custom ranges as an inclusive lower bound and exclusive upper bound with explicit timezone handling;
- apply format and date conditions to joined `notes` rows, not to FTS text;
- include every filter in React Query keys, pagination/cursor scope, API validation, OpenAPI documentation, benchmarks, and authorization/privacy tests; and
- evaluate ordinary composite indexes for metadata-only searches using measured query plans rather than adding dates or document types to FTS.

The Phase 3 candidate-query API should leave room for `documentTypes`, `updatedFrom`, and `updatedTo` conditions, but those parameters and UI controls are explicitly out of scope for Phase 3.

## Acceptance criteria

### Phase 1

- [x] Search database-call count is bounded independently of returned result count.
- [x] Search uses at most 5 logical calls for owned search and at most 8 for mixed owned/shared search in this fixture.
- [x] No p95 latency regression from the Phase 0 local baseline.
- [x] Existing privacy, collaboration, trash, and ranking behavior remains covered.

### Indexed-search phase

- 10,000-note local warm p95 remains below 50 ms for every benchmark case.
- Increasing the fixture from 1,000 to 10,000 notes does not produce near-linear growth for exact-title or rare-body search.
- Production interactive-search p95 target is below 300 ms after controlled rollout and observation.
- Storage growth and update cost are reported alongside latency improvements.

Absolute timings vary by machine. Review relative results, query counts, query plans, and correctness tests together.
