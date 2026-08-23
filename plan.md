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
