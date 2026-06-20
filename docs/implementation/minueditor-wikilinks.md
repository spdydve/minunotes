# MinuEditor Wikilinks Spec

## Goal
Add generic Obsidian-style wikilink support to MinuEditor while keeping MinuNotes-specific note resolution, permissions, and backlinks in the MinuNotes app.

Wikilinks:

```txt
[[Target]]
[[Target|Display Label]]
```

## Design principle
MinuEditor should understand the wikilink syntax and editor behavior, but it should not know what a target represents.

MinuNotes should provide note-specific behavior through callbacks.

## Responsibilities

### MinuEditor owns
- Parsing wikilink syntax in the editor document.
- Styling wikilinks inline.
- Hiding `[[` and `]]` markers when the cursor is not inside the link.
- Showing the full source form when the cursor is inside the link.
- Supporting display labels: `[[Target|Label]]` renders as `Label` when inactive.
- Autocomplete trigger when typing `[[`.
- Keyboard navigation in suggestions.
- Inserting selected suggestions as wikilinks.
- Calling host callbacks for open/create/resolve behavior.

### MinuNotes owns
- Note search suggestions.
- Resolving target titles to note IDs.
- Duplicate-title behavior.
- Creating unresolved notes.
- Navigation to notes.
- Backend link indexing.
- Backlinks API and UI.
- Permissions and visibility rules.
- Future graph view.

## Proposed MinuEditor API

```ts
type WikiLinkStatus = "resolved" | "unresolved" | "unknown";

type WikiLinkResolution = {
  status: WikiLinkStatus;
  href?: string;
  title?: string;
};

type WikiLinkSuggestion = {
  id: string;
  target: string;
  label?: string;
  detail?: string;
};

type WikiLinksConfig = {
  enabled?: boolean;
  resolve?: (target: string) => WikiLinkResolution | Promise<WikiLinkResolution>;
  suggest?: (query: string) => Promise<WikiLinkSuggestion[]>;
  onOpen?: (target: string, context: { event: MouseEvent | KeyboardEvent }) => void;
  onCreate?: (target: string) => void | Promise<void>;
};
```

Add to `MarkdownEditorProps`:

```ts
wikiLinks?: boolean | WikiLinksConfig;
```

## Editor behavior

### Typing
- Typing `[[` opens the wikilink suggestion popover.
- The editor may auto-pair the closing `]]` and place the cursor between markers.
- Typing text filters suggestions via `wikiLinks.suggest(query)`.
- `Enter` or `Tab` inserts the selected suggestion.
- `Escape` closes the popover.
- Arrow keys move selection.

### Inserted text
Selecting suggestion:

```ts
{ target: "Note B" }
```

inserts:

```txt
[[Note B]]
```

Selecting suggestion with label may insert either:

```txt
[[Target]]
```

or, if explicitly provided by host:

```txt
[[Target|Label]]
```

Recommendation: default to `[[Target]]` for MVP.

### Rendering inactive wikilinks
When cursor is outside the wikilink:

```txt
[[Note B]]
```

renders visually as:

```txt
Note B
```

with link styling.

```txt
[[Note B|the design note]]
```

renders visually as:

```txt
the design note
```

### Rendering active wikilinks
When cursor is inside or adjacent to the wikilink, show full source text:

```txt
[[Note B|the design note]]
```

This matches Obsidian-style source awareness.

### Resolved vs unresolved styling
- Resolved: normal internal-link color.
- Unresolved: muted/dashed/secondary styling.
- Unknown/loading: neutral link styling.

MinuEditor should expose CSS classes, not hardcoded app colors:

```css
.me-wikilink
.me-wikilink--resolved
.me-wikilink--unresolved
.me-wikilink--unknown
.me-wikilink-marker
.me-wikilink-label
.me-wikilink-suggestion
```

MinuNotes can style those via its theme variables.

## MinuNotes integration

MinuNotes usage should look like:

```tsx
<MarkdownEditor
  value={content}
  onChange={setContent}
  wikiLinks={{
    enabled: true,
    suggest: async (query) => {
      const result = query.trim()
        ? await api.searchNotes(query.trim())
        : await api.recentNotes(8);

      return result.notes.map((note) => ({
        id: note.id,
        target: note.title,
        label: note.title,
        detail: "Note",
      }));
    },
    resolve: async (target) => {
      const match = await api.resolveNoteTitle(target);
      return match
        ? { status: "resolved", href: `/notes/${match.id}`, title: match.title }
        : { status: "unresolved" };
    },
    onOpen: (target) => navigateToResolvedNote(target),
    onCreate: (target) => createNoteFromWikilink(target),
  }}
/>
```

## Backend support needed in MinuNotes

Current backend link indexing is still valuable and separate from editor rendering.

Additional optional endpoint for editor resolution:

```txt
GET /api/notes/resolve-title?title=Note%20B
```

Response:

```ts
{
  status: "resolved" | "unresolved" | "ambiguous";
  note?: { id: string; title: string; folderId: string };
}
```

Rules:
- Case-insensitive title matching.
- If exactly one match exists, resolved.
- If no match exists, unresolved.
- If multiple matches exist, ambiguous.

## MVP phases

### Phase 1 — MinuEditor generic wikilink extension
- Add `wikiLinks` prop.
- Parse wikilinks as editor decorations.
- Hide markers when inactive.
- Style resolved/unresolved/unknown states.
- Add suggestion popover for `[[`.
- Keyboard support: arrows, enter/tab, escape.

### Phase 2 — MinuNotes integration
- Replace app-side wikilink autocomplete stopgap with MinuEditor `wikiLinks` config.
- Add note title resolution endpoint if needed.
- Wire suggestion search to existing note search/recent APIs.
- Wire open behavior to router navigation.

### Phase 3 — Create unresolved note flow
- Click/command on unresolved link opens create-note dialog.
- Default target folder: current note folder.
- After create, update backend indexes and resolve link.

### Phase 4 — Polish
- Hover cards or previews.
- Ambiguous duplicate-title handling UI.
- Better mobile suggestion placement.
- Optional alias support.

## Verification
- Typing `[[` opens suggestions.
- Suggestions can be selected fully by keyboard.
- Selected suggestion inserts a valid wikilink.
- Inactive `[[Note B]]` displays as `Note B` with link styling.
- Active wikilink displays full source markers.
- Resolved and unresolved links have distinct styles.
- Clicking resolved wikilink navigates to the note.
- Unresolved link can trigger create flow once implemented.
- Existing backend backlinks continue to work.

## Non-goals for MinuEditor
- Storing link indexes.
- Knowing about MinuNotes note IDs/folders/users.
- Enforcing permissions.
- Building a graph view.
- Choosing MinuNotes-specific duplicate-title behavior.
