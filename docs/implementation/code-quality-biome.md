# Code Quality with Biome

## Summary

This project now uses [Biome](https://biomejs.dev/) as the primary code quality tool for formatting, linting, import organization, and common automated cleanup. Biome was added as a lightweight alternative to a traditional Prettier + ESLint setup.

The goal is to make code changes more consistent, easier to review, and safer for both human contributors and coding agents.

## Why Biome

We chose Biome because it provides a strong baseline with less tooling overhead:

- One tool for formatting, linting, and import organization.
- Fast checks, which matters when agents run verification often.
- Simple configuration compared with ESLint + Prettier plugin stacks.
- Built-in unused import detection and import organization.
- Easy migration path if the project later needs specialized ESLint rules.

Biome is not intended to replace every ESLint use case. If the project later needs stricter architectural rules, such as banning direct `process.env` access or enforcing package/file boundaries, ESLint can be added for those specialized checks while keeping Biome for formatting.

## Why this matters for agentic development

Agentic software development works best when the repository has fast, deterministic feedback loops. A coding agent should be able to edit code, run checks, fix issues, and verify the result without relying on subjective style review.

Biome helps by giving agents:

- A single command for style, lint, and import checks.
- Automatic safe fixes for common issues.
- Consistent formatting, reducing noisy diffs.
- Fast feedback, making it practical to run checks after small edits.
- Repository-specific rules that are visible in source control.

This reduces ambiguity. Instead of an agent guessing the preferred style, the agent can run Biome and follow the configured rules.

## Package scripts

The following scripts were added:

```bash
pnpm check
```

Runs the full Biome check across the repository:

- formatting checks
- lint checks
- import organization checks
- assist checks

```bash
pnpm check:write
```

Runs Biome and applies safe fixes across the repository.

```bash
pnpm format
```

Formats files only.

```bash
pnpm format:check
```

Checks formatting only without writing changes.

```bash
pnpm lint
```

Runs lint rules only.

TypeScript type checking remains separate:

```bash
pnpm typecheck
```

Tests remain separate:

```bash
pnpm test
```

## Agent workflow

The project instructions now tell agents to run Biome on changed files:

```bash
pnpm exec biome check --write <changed-files>
```

Agents should also run:

```bash
pnpm typecheck
```

after TypeScript changes, plus relevant tests for touched behavior.

Unsafe fixes should not be run unless explicitly requested:

```bash
pnpm exec biome check --write --unsafe <changed-files>
```

This matters because some useful fixes, such as converting string concatenation to template literals or sorting Tailwind classes, can theoretically change behavior in edge cases.

## Configuration details

The Biome configuration lives in `biome.jsonc`.

### VCS integration

```jsonc
"vcs": {
  "enabled": true,
  "clientKind": "git",
  "useIgnoreFile": true
}
```

Biome uses Git and respects ignored files. This prevents checks from spending time on files the project already treats as generated, local, or irrelevant.

### File includes and excludes

```jsonc
"files": {
  "includes": ["**", "!!**/dist", "!!**/.sst", "!!**/coverage", "!!drizzle"]
}
```

Biome checks the repository by default, but excludes generated or build-output directories:

- `dist`
- `.sst`
- `coverage`
- `drizzle`

`drizzle` is excluded to avoid formatting generated migration metadata and snapshots.

### Formatter

```jsonc
"formatter": {
  "enabled": true,
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 120
}
```

Formatting is enabled with:

- spaces instead of tabs
- 2-space indentation
- 120-character line width

A 120-character line width was chosen to reduce churn in existing JSX, route, and configuration files while still keeping lines reasonably readable.

### JavaScript and TypeScript formatting

```jsonc
"javascript": {
  "formatter": {
    "quoteStyle": "single",
    "semicolons": "always",
    "trailingCommas": "es5"
  }
}
```

This establishes the project style:

- single quotes for normal strings
- semicolons enabled
- trailing commas where supported by ES5 syntax

Single quotes were chosen as the preferred project style. Template literals are still used when interpolation is useful.

### JSON formatting

```jsonc
"json": {
  "formatter": {
    "trailingCommas": "none"
  }
}
```

JSON does not allow trailing commas, so Biome keeps JSON-compatible formatting for config files.

### Recommended lint rules

```jsonc
"linter": {
  "enabled": true,
  "rules": {
    "preset": "recommended"
  }
}
```

Biome's recommended rules provide a practical baseline for correctness, suspicious patterns, and maintainability without creating a large custom lint setup.

### Accessibility rules as warnings

Some accessibility rules are configured as warnings:

```jsonc
"a11y": {
  "noAutofocus": "warn",
  "noLabelWithoutControl": "warn",
  "useAriaPropsSupportedByRole": "warn",
  "useButtonType": "warn",
  "useSemanticElements": "warn"
}
```

These are useful issues to surface, but existing code currently has violations. Keeping them as warnings lets the project adopt Biome without forcing a large accessibility cleanup in the same branch.

### Prefer arrow function expressions

```jsonc
"complexity": {
  "useArrowFunction": "error"
}
```

This prefers arrow functions over function expressions where Biome can safely identify the conversion.

Example:

```ts
const handler = function () {
  return true;
};
```

becomes:

```ts
const handler = () => true;
```

Biome does not rewrite top-level function declarations with this rule.

### Template literals over string concatenation

```jsonc
"style": {
  "useTemplate": "warn"
}
```

This nudges code toward template literals when concatenating strings.

Example:

```ts
const message = 'Hello ' + name;
```

can become:

```ts
const message = `Hello ${name}`;
```

The rule is a warning because Biome treats this fix as unsafe in some cases due to JavaScript coercion and operator behavior.

### Tailwind class sorting

```jsonc
"nursery": {
  "useSortedClasses": {
    "level": "warn",
    "options": {
      "functions": ["clsx"]
    }
  }
}
```

This enables Biome's Tailwind-style utility class sorting diagnostics, including inside `clsx()` calls.

It is configured as a warning because Biome's class sorting is currently a nursery rule and not as mature as `prettier-plugin-tailwindcss`.

### Assignment in expressions as warnings

```jsonc
"suspicious": {
  "noAssignInExpressions": "warn"
}
```

Assignments inside expressions can be confusing and are often mistakes. The rule is useful, but existing code currently has at least one intentional pattern, so it starts as a warning.

### Import organization

```jsonc
"assist": {
  "enabled": true,
  "actions": {
    "source": {
      "organizeImports": "on"
    }
  }
}
```

Biome organizes imports and helps remove unused imports. This gives the project a basic import-sorting setup without relying on custom Prettier or ESLint import plugins.

Biome's import organization does not currently provide the same custom grouping controls as `@trivago/prettier-plugin-sort-imports`. We are intentionally using Biome defaults for now.

## What we intentionally did not add

### Full ESLint setup

We did not add ESLint because the project does not currently need its heavier plugin ecosystem. Biome covers the immediate needs with less configuration.

### `n/no-process-env`

We discussed eventually banning direct `process.env` access. That is still a good future direction, but it should happen after environment access is centralized into project-specific env modules.

Adding the rule before that cleanup would produce noise because this project currently uses environment variables in SST config, scripts, Vite config, and API runtime configuration.

### Strict filename and folder naming

We did not add strict filename/folder naming rules. This project uses TanStack Router-style filenames such as `notes.$noteId.tsx`, which would require exceptions.

### Custom import grouping

We chose Biome's default import organization instead of custom group ordering. If exact import groups become important later, this is a possible reason to add ESLint or another import sorting tool.

## Adoption plan

The current branch adds configuration only. It does not bulk-format the repository.

Recommended sequence:

1. Merge the Biome configuration branch.
2. Create a separate cleanup branch.
3. Run safe formatting and fixes:

   ```bash
   pnpm check:write
   ```

4. Verify:

   ```bash
   pnpm typecheck
   pnpm test
   ```

5. After the repository passes full `pnpm check`, consider adding it to `ci:local`.

Keeping the setup and cleanup in separate branches makes review easier and avoids hiding configuration decisions inside a large formatting diff.
