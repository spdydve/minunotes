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
