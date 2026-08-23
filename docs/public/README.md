# Public documentation

This directory contains documentation approved for publication through the central Minuscule Labs Starlight site.

## Boundaries

- Keep public product and integration guidance here.
- Keep architecture, plans, security reviews, runbooks, and operational details in `docs/implementation` or another private engineering directory.
- Never link public content to private documentation, environment files, certificates, or keys.
- Update public guides in the same pull request as user-visible behavior whenever possible.

## Authoring

Each Markdown or MDX page requires Starlight-compatible frontmatter:

```yaml
---
title: Page title
description: A concise public description.
sidebar:
  order: 1
---
```

Starlight renders the page title, so page bodies must start below heading level one. During the transition from in-app Resources, links use the existing `/resources/<slug>` form. The central assembler will map verified legacy slugs to mounted `/minunotes/` paths before publication; Phase 5 replaces those app routes with permanent redirects.

Run `pnpm docs:validate` before committing changes.
