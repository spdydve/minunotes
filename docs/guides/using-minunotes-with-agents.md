# Using MinuNotes with Agents

MinuNotes exposes a harness API and hosted MCP endpoint for agents to read, search, create, and edit notes without browser access.

## Recommended setup

1. In MinuNotes, create an API key for the agent.
2. Grant only the folder permissions the agent needs.
3. Enable folder creation only if the agent is explicitly allowed to create new folders. Agent-created folders are automatically scoped to that same API key.
4. Store credentials as environment variables or secrets, not in prompts:

```bash
export MINUNOTES_API_URL="https://api-dev-notes.dpklabs.com"
export MINUNOTES_API_KEY="ntak_..."
```

5. Give the agent the portable skill:

```txt
docs/skills/minunotes-harness/SKILL.md
```

6. Prompt the agent to use the skill:

```txt
Use the MinuNotes Harness Skill for note reading, searching, creation, and editing.
Use only the harness API. Do not use browser access.
```

## Agent-side flow

A small agent should treat MinuNotes as an optional skill triggered by note-related tasks.

Pseudo-code:

```ts
if (taskMatches("notes|minunotes|save this|search my notes|update note")) {
  loadSkill("minunotes-harness");
  requireEnv(["MINUNOTES_API_URL", "MINUNOTES_API_KEY"]);
}
```

Then route note operations through helper functions that wrap the harness API.

For MCP-capable hosted agents, use the hosted Streamable HTTP MCP endpoint instead:

```txt
https://<your-minunotes-host>/mcp
```

Hosted MCP uses OAuth bearer authentication for connected apps. Direct harness API access uses API keys with `/v1/harness/*`. Local MCP clients can still run the `notes-mcp` stdio binary with an owner-managed API key in the local process environment.

Recommended helper shape:

```ts
type MinuNotesConfig = {
  apiUrl: string;
  apiKey: string;
};

async function minunotesRequest<T>(
  config: MinuNotesConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiUrl = config.apiUrl.replace(/\/$/, "");
  const res = await fetch(`${apiUrl}/v1/harness${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`MinuNotes ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}
```

Example wrappers:

```ts
const MinuNotes = {
  folders: (config: MinuNotesConfig) =>
    minunotesRequest(config, "/folders"),

  createFolder: (config: MinuNotesConfig, input: { title: string }) =>
    minunotesRequest(config, "/folders", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createNote: (config: MinuNotesConfig, input: {
    folderId: string;
    title: string;
    content: string;
  }) =>
    minunotesRequest(config, "/notes", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  readNote: (config: MinuNotesConfig, noteId: string) =>
    minunotesRequest(config, `/notes/${noteId}`),

  editNote: (config: MinuNotesConfig, noteId: string, input: {
    baseHash: string;
    edits: Array<
      | { type: "append"; text: string }
      | { type: "replace_text"; oldText: string; newText: string }
      | { type: "replace_range"; from: number; to: number; text: string }
    >;
  }) =>
    minunotesRequest(config, `/notes/${noteId}/edit`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
```

## How an agent should use the skill

For any edit task, the agent should:

1. List or search for relevant notes.
2. Use backlinks/outgoing links when relationship context matters.
3. Read the target note.
4. Save the returned `contentHash`.
5. Make the smallest practical edit.
6. Send `baseHash: contentHash` with the edit request.
7. Read the note again.
8. Report the note ID, changed section, and final markdown or summary.

For organization tasks, agents can also read/update note tags through the harness API. Tags are lightweight labels, normalized to lowercase words with optional dashes, for example `plan` or `release-notes`.

## MCP and OpenAPI options

- Use **hosted MCP** (`/mcp`) for MCP-native hosted agents, cloud agents, ChatGPT-style OAuth connected apps, and team-managed runtimes.
- Use **local stdio MCP** (`notes-mcp`) for desktop clients that spawn local MCP processes.
- Use the **harness skill/API** for coding agents that can call HTTPS directly and do not need MCP transport.
- Use **OpenAPI** for REST/OpenAPI-native platforms such as custom actions or tools importers.

OpenAPI documents are available at:

```txt
GET /openapi.json
GET /v1/openapi.json
```

Direct harness API paths live under `/v1/harness/*` and use `X-API-Key` authentication. Hosted MCP uses `/mcp` with OAuth bearer authentication while sharing the same underlying permission model.

Useful graph and organization endpoints include:

- `GET /v1/harness/tags`
- `GET /v1/harness/notes/search?q=...&tag=...`
- `GET /v1/harness/notes/:noteId/tags`
- `PUT /v1/harness/notes/:noteId/tags`
- `GET /v1/harness/notes/:noteId/backlinks`
- `GET /v1/harness/notes/:noteId/links`
- `GET /v1/harness/notes/orphans`

## Best practices

- Use one API key per agent/project.
- Use least-privilege folder permissions.
- Keep folder creation disabled unless the agent has explicit permission to create new folders.
- Revoke keys when a project ends.
- Do not paste API keys into chat prompts.
- Store credentials in env vars or a secret store.
- Ask agents to report exact note IDs and final changes.
- For destructive or broad edits, require confirmation before calling the edit endpoint.

## Testing a fresh agent

Use the smoke eval:

```txt
docs/evals/minunotes-harness-smoke.md
```

The eval checks whether an agent with no prior context can create, read, edit, and report a note using only the skill and harness API.
