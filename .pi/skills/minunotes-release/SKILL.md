---
name: minunotes-release
description: Prepare, verify, ship, and finalize MinuNotes production releases with SemVer, Git tags, deployment checks, and MinuNotes release records. Use for MinuNotes release status, changelog curation, production deployment, tagging, or release finalization.
compatibility: Requires the MinuNotes repository, git, pnpm, production credentials for shipping, and registered minunotes_* tools for release records.
---

# MinuNotes Release

Run the requested release phase only. Infer the phase from the user argument: `status`, `prepare`, `verify`, `ship`, or `finalize`. Default to `status` when no phase is supplied.

Do not automatically advance from one phase to another when a human gate, failed check, ambiguity, or production action is reached.

## Release policy

- Git tags are the authoritative production release boundaries.
- Tag production releases only; do not tag development deployments.
- Keep `package.json` and the Git tag on the same SemVer version.
- Create annotated tags named `vX.Y.Z` only after production deployment and smoke checks pass.
- Never move, recreate, force-push, or delete an existing release tag.
- Never deploy from a dirty worktree, feature branch, or commit that is not pushed to `origin/main`.
- Batch tiny unpublished changes when practical, but do not leave a production deployment without a release tag.
- Keep release notes user-facing. Put detailed architecture and implementation evidence in linked notes.
- Do not introduce a repository changelog, GitHub Release, or additional release automation unless separately approved.

## SemVer guidance

- Patch `X.Y.Z+1`: fixes, dependency patches, and minor polish.
- Minor `X.Y+1.0`: meaningful user-facing capabilities with compatible behavior.
- Major `X+1.0.0`: breaking product, API, data, or operational contracts.

Suggest a version from the changes, but require the user to confirm an ambiguous version before preparing it.

## MinuNotes release records

Prefer these stable records, but search by exact title if an ID no longer resolves:

- Releases folder: `folder_f3522ca0b1404a628fc49b4ab3322553`
- Unreleased note: `note_26227aa114ee4ef4bfd9d782c7d528f4` (`MinuNotes — Unreleased`)
- Historical index: `note_a27062c028cb461d9db4749512c45dd1` (`MinuNotes Historical Changelog`)

For every MinuNotes edit:

1. Read the latest note and obtain its `contentHash`.
2. Use that hash as `baseHash`.
3. Prefer exact targeted replacements over whole-note replacement.
4. Read the result back and verify headings, links, and boundaries.
5. Stop and reread on a conflict; never retry against a stale hash.

## Phase: status

This phase is read-only.

1. Inspect:
   - `git branch --show-current`
   - `git status --short`
   - local/remote divergence after `git fetch origin main`
   - latest SemVer tag
   - `package.json` version
   - commits since the latest release tag
   - existing tag conflicts
2. Read `MinuNotes — Unreleased` and the historical index.
3. Report:
   - current release boundary;
   - completed changes not yet released;
   - dirty, unpushed, or divergent state;
   - suggested next version;
   - missing verification or release records.
4. Do not edit, commit, push, deploy, or tag.

## Phase: prepare

Preparation may edit files and MinuNotes but must not deploy or tag.

1. Start from a clean or intentionally scoped worktree. Preserve unrelated changes.
2. Confirm the target version and ensure neither the local nor remote tag exists.
3. Review commits from the latest tag through the candidate commit.
4. Curate `MinuNotes — Unreleased` into concise `Added`, `Changed`, `Fixed`, `Security`, and `Documentation` sections as applicable.
5. Include completed release candidates only. Clearly label anything not committed or merged.
6. Update `package.json` to the confirmed version. Update lockfiles only if the package manager requires it.
7. Run Biome on changed repository files and `git diff --check`.
8. Create a release-preparation commit such as `chore: prepare vX.Y.Z release` only when the user requested preparation through commit.
9. Report the exact candidate commit and stop before push or production deployment.

## Phase: verify

Verification does not imply permission to ship.

1. Review dependency and lockfile changes, especially unexpected transitive upgrades.
2. Run required checks:

```bash
pnpm exec biome check --write <changed-files>
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

3. Run relevant Playwright specs for changed behavior. State whether coverage was targeted or full.
4. Do not use Biome unsafe fixes.
5. Separate existing warnings from failures.
6. Confirm:
   - clean release candidate;
   - `package.json` version matches the proposed tag;
   - current commit contains all approved changes;
   - no tag conflict exists.
7. Record concrete commands and results in the Unreleased note when useful.
8. Stop on any failure and do not ship.

## Phase: ship

Shipping is a production action. A direct request such as `/skill:minunotes-release ship vX.Y.Z` counts as explicit approval for that version. Otherwise, present the verified candidate and ask for approval before pushing or deploying.

Preflight requirements:

- current branch is `main`;
- worktree is clean;
- local `main` is based on current `origin/main` with no remote-only commits;
- package version is `X.Y.Z`;
- `vX.Y.Z` does not exist locally or remotely;
- verification passed for the current commit.

Then:

1. Push `main`.
2. Confirm `main` and `origin/main` point to the same commit.
3. Run `pnpm release:production` and complete its production confirmation.
4. Require successful typecheck, tests, build, migration check/application, deployment, API smoke, and web smoke.
5. If deployment or smoke checks fail, do not create the tag. Report the deployed/pushed state and recovery options.
6. After all production checks pass, create an annotated tag:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

7. Verify the remote annotated tag resolves to the deployed commit.
8. Do not amend or add release code after tagging. A follow-up requires a new patch version.

## Phase: finalize

Finalize only after the remote tag exists and resolves to the deployed `origin/main` commit.

1. Read `assets/release-note-template.md` relative to this skill directory.
2. Create `MinuNotes — vX.Y.Z — YYYY-MM-DD` in the Releases folder.
3. Include:
   - concise user-facing changes;
   - verification results;
   - migration result;
   - API and web smoke results;
   - full release commit SHA;
   - integration commits when useful;
   - branch, deployment, and tag status;
   - relevant implementation-note links.
4. Update `MinuNotes Historical Changelog`:
   - add the new release at the top of `Tagged releases`;
   - point `Current` to changes after the new version.
5. Reset `MinuNotes — Unreleased` to:
   - state that it tracks changes after the new version;
   - say no changes are recorded yet;
   - link the previous release and historical index.
6. Update directly related implementation notes from pending to released when their release is unambiguous.
7. Read all changed notes back and verify there is no duplicated or truncated content.
8. Report the release-note ID, tag, commit, production URLs, and clean synchronization state.

## Stop conditions

Stop and request input or report a blocker when:

- the SemVer bump is ambiguous;
- the worktree contains unrelated changes;
- `main` has diverged from `origin/main`;
- the package version and proposed tag differ;
- the tag already exists;
- any required verification fails;
- production credentials or MinuNotes tools are unavailable;
- migrations, deployment, or smoke checks fail;
- a MinuNotes concurrency conflict occurs;
- the candidate commit changes after verification.
