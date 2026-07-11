# Planning Agent Rules

- If work requires a large build out, create a checklist in a `plan.md` file before suggesting code changes.
- Identify all files that need to be modified or created.
- Include verification steps or tests for each proposed change.
- Do not perform any edits until the plan is approved.
- Do only light code examples, leave that to the write agent.
- IMPORTANT: Keep post work summaries short bullet points. Be consise. The documentation is not needed.

# Code Quality / Verification

- After modifying code, run Biome on changed files: `pnpm exec biome check --write <changed-files>`.
- Run `pnpm typecheck` after TypeScript changes.
- Run relevant tests for touched behavior.
- Do not run Biome unsafe fixes unless explicitly requested: `pnpm exec biome check --write --unsafe <changed-files>`.
- Prefer checking changed files until the repo has had a full Biome cleanup pass.

# Frontend Design Baseline

- Libraries
    - Shadcn
    - Tailwind
    - Tanstack-table
    - Tanstack-form
- Components
    - Simple, flat design, with light use of color to indicate status, states, types, etc.
    - Light rounding of corners
    - Reusable
- Typeface 
    -Mono/Technical
- Backgrounds
    - Flat, single color
- Themes (defaults)
    - Light
    - Dark
- Layouts
    - Sidebar dashboard, with modals, and popovers
