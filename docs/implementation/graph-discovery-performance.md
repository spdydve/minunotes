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

Phase 1 is justified. The first implementation should bound candidate and incoming-link work while keeping the existing authorization predicates authoritative, then batch only the metadata needed to mask direct-note folder access.

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

## Phase 1 bounded orphan discovery

Phase 1 avoids a broad authorization refactor. Instead of loading every candidate and placing every candidate ID in one incoming-link query, it:

- reads an initial batch of at most 250 compact candidate notes;
- checks incoming links only for that bounded candidate set;
- scans orphan results until the requested offset or cursor and `limit + 1` are satisfied;
- increases later candidate batches to at most 1,000 rows when dense links require continued scanning;
- preserves the existing candidate and incoming-source authorization predicates;
- applies folder-scope filtering before harness cursor pagination; and
- resolves result access metadata in one batch for direct-note folder masking.

The adaptive batch keeps sparse first-page reads small while avoiding excessive database round trips when many early candidates have incoming links. At no point does the application load all 10,000 candidate notes or construct a 10,000-ID `IN` list.

### Phase 1 results at 10,000 notes

| Profile | Scope | Before median | After median | Before p95 | After p95 | Before calls | After calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sparse, 10-link fanout | Owner | 89.11 ms | 16.71 ms | 103.66 ms | 28.77 ms | 42 | 2 |
| Sparse, 10-link fanout | Collaborator | 100.56 ms | 23.51 ms | 123.05 ms | 23.91 ms | 62 | 4 |
| Dense, 1,000-link fanout | Owner | 90.47 ms | 42.18 ms | 104.96 ms | 54.36 ms | 42 | 4 |
| Dense, 1,000-link fanout | Collaborator | 101.92 ms | 58.50 ms | 129.46 ms | 59.04 ms | 62 | 6 |

Sparse first-page database calls no longer grow with the 20 returned notes. Dense fixtures need one additional candidate/incoming pair because the first 1,001 title-ordered notes are linked, but still avoid loading the remaining graph.

Offset pagination may scan preceding orphan candidates again for later pages; this preserves the existing internal API contract. Harness cursor pagination starts directly after the prior title/ID position.

Focused tests cover internal offset and harness cursor pagination after more than 250 linked candidates, along with existing inaccessible-source, selected-grant, folder-masking, collaboration, and Trash behavior.

## Phase 2 batched harness link access

The internal note routes already authorize outgoing targets and backlink sources in bounded database calls. Harness routes previously applied integration-specific access by calling the complete point-read path once per returned link.

At 999 links this produced approximately three database calls per result:

| Case | Before median | After median | Before p95 | After p95 | Before calls | After calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Harness outgoing links | 340.53 ms | 16.63 ms | 363.62 ms | 17.66 ms | 3,003 | 12 |
| Harness backlinks | 313.77 ms | 15.27 ms | 321.87 ms | 15.55 ms | 3,002 | 11 |

The harness now:

- deduplicates linked note IDs;
- loads compact note ownership/folder resources in chunks of at most 500 IDs;
- applies the existing integration discovery SQL before retaining a resource;
- resolves collaboration role and direct-note versus folder-grant source in one batch;
- nulls inaccessible outgoing targets without revealing canvas target metadata;
- excludes inaccessible backlink sources; and
- continues masking backlink source folders for direct-note grants.

Chunking avoids SQL variable-limit failures for unusually large link sets. Database calls can grow by one compact resource query per 500 unique linked notes, but no longer grow by roughly three calls per result.

The response contract remains unchanged and unpaginated. A 999-link response is still roughly 262–293 KB, so pagination remains a separate compatibility decision rather than being bundled into this optimization. Regression coverage includes existing mixed-access privacy cases and a new 501-result boundary crossing two access-resource chunks.
