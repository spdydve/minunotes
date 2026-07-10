# MinuNotes Harness Agent Smoke Eval

Use this eval to test whether a fresh agent with no project history can operate MinuNotes through the harness API using only the portable skill.

## Setup

Create or choose an API key with access to a disposable test folder. If testing folder creation, enable folder creation on the API key; otherwise use only the disposable folder already granted to the key.

Required environment for the evaluated agent:

```bash
export MINUNOTES_API_URL="https://api-dev-notes.dpklabs.com"
export MINUNOTES_API_KEY="<api key>"
```

Give the agent the skill at:

```txt
docs/skills/minunotes-harness/SKILL.md
```

Do not provide browser access or prior conversation history.

## Agent prompt

```txt
You have access to MinuNotes through the MinuNotes Harness Skill.

Use only the harness API. Do not use browser access.

Task:
1. Read the MinuNotes Harness Skill.
2. List available folders.
3. Pick the most appropriate folder you can create notes in.
4. Do not create a folder unless the key was explicitly configured for folder creation and the prompt asks you to test it.
5. Create a note titled "Agent Harness Smoke Test".
6. The note content should be markdown and include:
   - an H1 heading matching the title
   - a short sentence explaining this is an agent harness smoke test
   - a checklist of at least 4 capabilities you verified or attempted
7. Read the note back and capture its note ID and content hash.
8. Edit exactly one checklist item from unchecked to checked using the harness edit endpoint with `baseHash`.
9. Read the note back again.
10. Report:
   - folder ID
   - note ID
   - whether the edit succeeded
   - final markdown
   - any API errors encountered

If you cannot complete a step due to permissions or API errors, stop and report the exact endpoint, status, and response body.
```

## Success criteria

The agent succeeds if it:

- Uses `X-API-Key` authentication.
- Lists folders through `/v1/harness/folders`.
- Creates a note through `/v1/harness/notes`.
- Reads the note after creation.
- Uses `baseHash` on edit.
- Makes one targeted edit through `/v1/harness/notes/:noteId/edit`.
- Reads back the final note.
- Reports IDs and final markdown.

## Failure signals to watch

- Uses browser/UI instead of harness API.
- Omits `baseHash` when editing.
- Fabricates IDs or content without reading API responses.
- Edits too broadly or rewrites unrelated markdown.
- Ignores 401/403/409 errors.
- Cannot infer API base normalization (`MINUNOTES_API_URL` without trailing slash).

## Optional follow-up eval

Ask the same agent to:

```txt
Find the note titled "Agent Harness Smoke Test", read its outline, fetch its main section, append a "Results" section, and report the note events.
```

Expected endpoints:

- `GET /v1/harness/notes/search?q=Agent%20Harness%20Smoke%20Test`
- `GET /v1/harness/notes/:noteId/outline`
- `GET /v1/harness/notes/:noteId/sections/:sectionId`
- `POST /v1/harness/notes/:noteId/edit`
- `GET /v1/harness/notes/:noteId/events`
