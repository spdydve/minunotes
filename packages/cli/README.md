# @minunotes/cli

CLI for MinuNotes harness workflows. Uses `@minunotes/sdk` and API key auth.

```sh
export NOTES_API_URL="https://api.notes.example.com"
export NOTES_API_KEY="ntak_..."

notes folders list
notes folders create "Agent Workspace"
notes notes create --folder <folder-id> --title "Hello" --content ./note.md
notes notes edit <note-id> --old "before" --new "after" --base-hash <hash>
notes search "query" --json
```

Build locally:

```sh
pnpm --filter @minunotes/cli build
```
