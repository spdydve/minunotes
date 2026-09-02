# Graph discovery performance

## Scope

This document establishes the Phase 0 baseline for orphan, outgoing-link, and backlink discovery. It does not change production behavior or authorization.

Run the deterministic local benchmark with:

```bash
pnpm benchmark:graph
```

Options:

```bash
pnpm benchmark:graph --sizes=100,1000,10000 --iterations=7 --link-fanout=1000
```

The fixture creates one owner folder, an inherited viewer grant for a collaborator, deterministic notes, one high-fanout outgoing source, and one high-fanout backlink target. It exercises the production internal note routes and records warm median/p95 latency, logical database calls, response bytes, result counts, and representative query plans.

Absolute local timings vary. Compare growth, calls, payload size, query plans, and authorization behavior together.

## Dense-link baseline

Default fixture with up to 1,000 authored outgoing links and backlinks:

| Notes | Case | Warm median | Warm p95 | DB calls | Response | Results |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 100 | Owner orphans | 3.41 ms | 5.03 ms | 4 | 266 B | 1 |
| 100 | Collaborator orphans | 3.11 ms | 3.81 ms | 5 | 266 B | 1 |
| 1,000 | Owner orphans | 12.85 ms | 14.77 ms | 4 | 266 B | 1 |
| 1,000 | Collaborator orphans | 18.77 ms | 31.57 ms | 5 | 266 B | 1 |
| 10,000 | Owner orphans | 90.47 ms | 104.96 ms | 42 | 4.32 KB | 20 |
| 10,000 | Collaborator orphans | 101.92 ms | 129.46 ms | 62 | 4.32 KB | 20 |
| 1,000 | Owner outgoing links | 12.93 ms | 13.36 ms | 5 | 261.51 KB | 999 |
| 1,000 | Collaborator outgoing links | 13.05 ms | 16.53 ms | 6 | 261.51 KB | 999 |
| 1,000 | Owner backlinks | 11.22 ms | 12.93 ms | 4 | 292.73 KB | 999 |
| 1,000 | Collaborator backlinks | 13.10 ms | 14.74 ms | 5 | 292.73 KB | 999 |

At 10,000 notes, the link fanout remains 1,000 and link/backlink timing stays near the 1,000-note case. This indicates those queries primarily scale with links returned rather than total notes in this fixture.

## Sparse-link orphan baseline

A second run with `--link-fanout=10` leaves enough orphan results to fill the first page at every size:

| Notes | Case | Warm median | Warm p95 | DB calls | Results |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Owner orphans | 7.89 ms | 10.06 ms | 42 | 20 |
| 100 | Collaborator orphans | 7.67 ms | 8.53 ms | 62 | 20 |
| 1,000 | Owner orphans | 13.61 ms | 22.21 ms | 42 | 20 |
| 1,000 | Collaborator orphans | 14.45 ms | 15.79 ms | 62 | 20 |
| 10,000 | Owner orphans | 89.11 ms | 103.66 ms | 42 | 20 |
| 10,000 | Collaborator orphans | 100.56 ms | 123.05 ms | 62 | 20 |

## Findings

### Orphan discovery is the first material bottleneck

`listOrphanNotes()` currently:

1. loads every accessible active note;
2. sends all candidate IDs into an incoming-link query;
3. loads accessible incoming links;
4. filters linked IDs in application memory;
5. sorts or slices the complete visible set; and
6. resolves access again for each returned internal API note.

Latency grows from roughly 8 ms at 100 sparse notes to 89–101 ms median at 10,000 notes even though only 20 notes are returned.

The first-page serialization path adds two owner access calls per result or three collaborator access calls per result. That produces 42 owner calls and 62 collaborator calls for a full 20-note page.

Representative plans also show:

- a temporary B-tree for candidate title ordering; and
- a full `note_links` scan for the incoming-link phase in this fixture.

Phase 1 is justified: move the accessible incoming-link anti-join and pagination into SQL, then batch only the metadata needed to mask direct-note folder access.

### Links and backlinks have bounded calls but unbounded payloads

The internal routes use four to six logical calls regardless of a 999-link result count, and local query latency remains modest. However, the endpoints return every link:

- 999 outgoing links produce about 262 KB;
- 999 backlinks produce about 293 KB.

Both representative plans use indexed source/target lookup but require a temporary B-tree for title ordering.

This is primarily a payload and API-contract concern rather than the first database bottleneck. Pagination or limits require explicit compatibility review. Harness routes should also be measured separately because they perform additional per-target/source checks when integration-specific access is required.

## Safety constraints for follow-up

An optimized orphan query must preserve the existing graph-relative definition:

> A visible note is orphaned only when no accessible, active source note links to it.

The implementation must:

- authorize both candidate targets and incoming source notes before pagination;
- exclude trashed notes and notes under trashed folder ancestors;
- preserve owner, collaborator, and integration scope behavior;
- preserve title/ID ordering and existing offset/cursor contracts;
- mask folder metadata for direct-note grants;
- avoid inaccessible counts and pagination effects; and
- avoid limiting incoming candidates before authorization.

## Phase 0 conclusion

Proceed with a separately reviewed orphan-discovery optimization. Defer production link/backlink pagination until response-size compatibility and harness behavior are designed explicitly.
