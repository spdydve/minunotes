# MinuEditor v0.11.1 upgrade plan

## Scope

Upgrade MinuNotes from MinuEditor v0.10.12 to v0.11.1, expose the approved editor features, preserve live/static parity, and update user-facing Markdown documentation. Light skill guidance and theme-aware Mermaid rendering were approved as follow-ups.

## Files to modify

- [x] `package.json` — bump `@dpklabs/minueditor` to `v0.11.1`.
- [x] `pnpm-lock.yaml` — resolve and lock the new release.
- [x] `src/frontend/components/note-editor.tsx` — enable Mermaid in live editing while retaining default rich paste behavior.
- [x] `src/frontend/components/notes-markdown-renderer.tsx` — enable theme-aware Mermaid in static/shared rendering.
- [x] `src/frontend/lib/themes.ts` — publish reactive active-theme state and map light/dark MinuNotes themes to Mermaid themes.
- [x] `src/frontend/styles.css` — map new callout and Mermaid surfaces to the MinuNotes theme system.
- [x] `docs/guides/markdown-editor.md` — document callouts, Mermaid, and rich paste.
- [x] `src/frontend/docs/resources/markdown-editor.mdx` — publish matching in-app guidance.
- [x] `tests/browser/note-editor.spec.ts` — cover callout rendering, Mermaid rendering and live theme changes, and rich paste.
- [x] `tests/browser/shared-wikilinks.spec.ts` — verify static Mermaid/callout parity.
- [x] `docs/skills/minunotes-harness/SKILL.md` — add light guidance for preserving callouts and Mermaid fences after separate approval.
- [x] `docs/skills/minunotes-harness-api/SKILL.md` — keep the API-only skill guidance aligned.

## Explicit non-changes

- [x] Did not modify harness, MCP, OpenAPI, or registered tool schemas; Markdown storage/editing is already syntax-agnostic.
- [x] Did not add an outline UI solely because v0.11.1 exposes heading APIs.

## Verification

- [x] Ran `pnpm exec biome check --write` on changed files without unsafe fixes; only existing warnings remain.
- [x] `pnpm typecheck` passed.
- [x] Targeted editor/shared-view browser tests passed (15/15).
- [x] `pnpm test` passed (186/186).
- [x] `pnpm build` passed with the existing large-chunk advisory.
- [x] `git diff --check` passed and the final diff was reviewed.

## Approval

- [x] User approved dependency, integration, theming, documentation, and verification work.
- [x] User initially deferred skill updates, then separately approved the light Rich Markdown guidance.
- [x] User separately approved reactive light/dark Mermaid themes.
