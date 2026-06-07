# @dpklabs/notes-cli

CLI for Notes. Uses `@dpklabs/notes-sdk` and API key auth.

```sh
export NOTES_API_URL="https://api.notes.example.com/api"
export NOTES_API_KEY="mn_..."

notes folders list
notes notes list --folder <folder-id>
notes notes create --folder <folder-id> --title "Hello" --content ./note.md
notes search "query" --json
```

Build locally:

```sh
pnpm --filter @dpklabs/notes-cli build
```
