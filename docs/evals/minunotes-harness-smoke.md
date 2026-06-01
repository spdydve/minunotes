# MinuNotes Harness Agent Smoke Eval

Use this eval to test whether a fresh agent with no project history can operate MinuNotes through the harness API using only the portable skill.

## Setup

Create or choose an API key with access to a disposable test folder.

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
4. Create a note titled "Agent Harness Smoke Test".
5. The note content should be markdown and include:
   - an H1 heading matching the title
   - a short sentence explaining this is an agent harness smoke test
   - a checklist of at least 4 capabilities you verified or attempted
6. Read the note back and capture its note ID and content hash.
7. Edit exactly one checklist item from unchecked to checked using the harness edit endpoint with `baseHash`.
8. Read the note back again.
9. Report:
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
- Lists folders through `/api/harness/folders`.
- Creates a note through `/api/harness/notes`.
- Reads the note after creation.
- Uses `baseHash` on edit.
- Makes one targeted edit through `/api/harness/notes/:noteId/edit`.
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

- `GET /api/harness/notes/search?q=Agent%20Harness%20Smoke%20Test`
- `GET /api/harness/notes/:noteId/outline`
- `GET /api/harness/notes/:noteId/sections/:sectionId`
- `POST /api/harness/notes/:noteId/edit`
- `GET /api/harness/notes/:noteId/events`
