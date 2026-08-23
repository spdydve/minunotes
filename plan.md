# Public Resources and Getting Started Plan

## Status

**Implemented and verified. Public guide-based onboarding is complete; stateful onboarding remains deferred.**

## Goal

Make MinuNotes Resources readable without an account, reorganize them around user tasks, and add a clear getting-started path while retaining a distinct advanced section for agents and developers.

Canonical URLs remain on the product domain:

- Resource library: `https://notes.minusculelabs.com/resources`
- Guides: `https://notes.minusculelabs.com/resources/<slug>`

A future product page on `minusculelabs.com/minunotes` can link to this library without requiring a separate documentation deployment.

## Product decisions

### Public access

- `/resources` and `/resources/*` render without authentication.
- Public resource routes do not load folders, notes, or other private account data.
- Authenticated users can still reach Resources from the app navigation.
- Public pages use a small dedicated header with MinuNotes branding, a Resources link, and a Sign in/Open MinuNotes action rather than the private app sidebar.
- Unknown resource slugs return a useful not-found state with links back to Resources and Getting Started.

### Information architecture

Replace the current flat card grid with two clear tracks:

1. **Learn MinuNotes** — user-facing product guidance.
2. **Build with MinuNotes** — agents, APIs, MCP, OpenAPI, and advanced integration testing.

Feature **Getting started** as the primary call to action. Group the rest by task rather than by implementation detail.

Proposed user-facing catalog:

- **Start here**
  - Getting started *(new)*
- **Write**
  - Markdown and editor *(existing, revise)*
  - Slash commands *(existing, revise)*
  - Images and attachments *(new)*
  - Canvas notes *(new)*
- **Organize**
  - Folders and notes *(new)*
  - Wikilinks and backlinks *(existing, revise)*
  - Tags and note details *(existing, revise)*
  - Search and navigation *(new)*
- **Collaborate**
  - Share notes and folders *(new)*
  - Comments and Review *(new)*
  - Permissions and private content *(new)*
- **Protect and recover**
  - Trash and version history *(new)*

Proposed technical catalog:

- Agent integrations *(existing)*
- Skills *(existing)*
- MCP *(existing)*
- Harness API *(existing)*
- OpenAPI *(existing)*
- Manual integration testing *(existing; label Advanced)*

### Getting-started guide

Create one concise, task-based guide rather than a stateful product tour in this phase:

1. Sign in and understand the workspace.
2. Create a folder and first note.
3. Write using Markdown or slash commands.
4. Connect notes with wikilinks and tags.
5. Find content with search.
6. Share or invite collaborators.
7. Choose next steps: canvas, comments, integrations, or deeper organization.

The guide will use short steps, expected outcomes, and links to deeper resource pages. Screenshots can be added later through a documented image convention; the first pass will not depend on screenshots becoming stale.

### Resource presentation

- Add typed metadata for section, audience, order, featured status, and related guides.
- Present a featured Getting Started panel followed by grouped sections.
- Add a compact resources navigation on guide pages, with the current guide highlighted.
- Add related guides and previous/next links at the end of each guide.
- Keep layouts flat, technical, responsive, and consistent with the existing light/dark themes.
- Use descriptive page titles and descriptions for browser and social metadata where the SPA supports them.
- Keep the explicit typed resource registry rather than introducing a second docs framework or frontmatter plugin in this phase.

## Implementation checklist

### 1. Public routing and shell

- [x] Add resource-route detection that is shared by `AppShell` and tests.
- [x] Render resource routes outside the authenticated application shell.
- [x] Create a reusable public resources shell/header.
- [x] Preserve authenticated in-app navigation into and out of Resources.
- [x] Ensure resource pages render before or without session resolution.

Files:

- Modify `src/frontend/components/app-shell.tsx`.
- Create `src/frontend/components/public-resources-shell.tsx`.
- Modify `src/frontend/routes/resources.tsx`.
- Modify `src/frontend/routes/resources.$slug.tsx`.
- Modify `src/frontend/styles.css` only for shared public-resource layout/MDX styles that Tailwind cannot express cleanly.

### 2. Resource registry and navigation

- [x] Extend resource metadata with stable section IDs, audience, order, featured status, and related slugs.
- [x] Add section definitions and helpers for ordered/grouped resources.
- [x] Validate that slugs and related links are unique and resolvable.
- [x] Redesign the library as Start Here, Learn MinuNotes, and Build with MinuNotes sections.
- [x] Add guide sidebar/mobile navigation and previous/next/related links.

Files:

- Modify `src/frontend/docs/resources/index.ts`.
- Modify `src/frontend/components/resource-doc-layout.tsx`.
- Modify `src/frontend/routes/resources.tsx`.
- Create `tests/frontend-resources.test.ts`.

### 3. Getting started and user guides

- [x] Create the Getting Started guide.
- [x] Create focused guides for currently undocumented product workflows.
- [x] Revise existing user guides for public readers, consistent terminology, and cross-links.
- [x] Keep API/developer details out of basic user guides unless linked as an advanced next step.

Files to create:

- `src/frontend/docs/resources/getting-started.mdx`
- `src/frontend/docs/resources/folders-and-notes.mdx`
- `src/frontend/docs/resources/images-and-attachments.mdx`
- `src/frontend/docs/resources/canvas-notes.mdx`
- `src/frontend/docs/resources/search-and-navigation.mdx`
- `src/frontend/docs/resources/sharing-and-collaboration.mdx`
- `src/frontend/docs/resources/comments-and-review.mdx`
- `src/frontend/docs/resources/permissions-and-privacy.mdx`
- `src/frontend/docs/resources/trash-and-version-history.mdx`

Files to revise:

- `src/frontend/docs/resources/markdown-editor.mdx`
- `src/frontend/docs/resources/slash-commands.mdx`
- `src/frontend/docs/resources/wikilinks-backlinks.mdx`
- `src/frontend/docs/resources/tags-details.mdx`
- Existing technical MDX files only where public navigation, terminology, or related links require updates.

### 4. Public entry points and metadata

- [x] Add a Resources link to the unauthenticated sign-in experience.
- [x] Set resource-specific document titles and description metadata.
- [x] Ensure public pages have clear Sign in/Open MinuNotes calls to action.
- [x] Keep `minusculelabs.com/minunotes` out of this repository unless its source is later added; document it as an external follow-up.

Files:

- Modify `src/frontend/routes/auth.tsx`.
- Modify `src/frontend/routes/resources.tsx`.
- Modify `src/frontend/routes/resources.$slug.tsx`.
- Optionally create `src/frontend/lib/document-metadata.ts` if metadata behavior would otherwise be duplicated.

### 5. Verification

- [x] Add browser coverage proving `/resources` and a guide load without an authenticated session or private API requests.
- [x] Add browser coverage for the public header, Getting Started path, grouped catalog, guide navigation, and sign-in action.
- [x] Confirm authenticated users can still navigate to Resources from the sidebar and return to notes.
- [x] Add unit coverage for resource ordering, unique slugs, valid relationships, and public route detection.
- [x] Check narrow/mobile and desktop layouts.
- [x] Run Biome on changed files.
- [x] Run `pnpm typecheck`.
- [x] Run focused Vitest tests.
- [x] Run focused Playwright resource/navigation tests.
- [x] Run `pnpm build`.

Test files:

- Create `tests/frontend-resources.test.ts`.
- Modify `tests/browser/navigation.spec.ts` or create `tests/browser/resources.spec.ts` if separation is clearer.

## Explicitly deferred

- Stateful first-login onboarding tours, checklists, or user progress storage.
- A separate Astro/Starlight deployment.
- Full-text documentation search; add once the guide count makes category navigation insufficient.
- Localization.
- Screenshot automation.
- Changes to the external `minusculelabs.com` site.

## Approval question

Approve this as a **public guide-based onboarding phase**, with a stateful first-login product tour deferred. If you want an in-app onboarding checklist or walkthrough in this branch, that should be added as a separate workstream because it requires product-state and dismissal/progress decisions.
