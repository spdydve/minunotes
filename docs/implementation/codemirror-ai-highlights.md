# CodeMirror AI Change Highlights

## Goal
Render document ranges or lines that were added/updated by an AI agent separately from normal user edits.

## Core Idea
Keep markdown clean. Store change metadata outside the markdown, then render it in CodeMirror with decorations.

```txt
markdown = canonical document content
change metadata = external annotations
CodeMirror = visual rendering layer
```

## Example Metadata

```ts
export interface DocumentChangeAnnotation {
  id: string
  documentId: string
  actorType: 'user' | 'agent' | 'system'
  actorId?: string
  kind: 'added' | 'updated' | 'deleted' | 'generated'
  anchorType: 'line' | 'range'
  startLine?: number
  endLine?: number
  from?: number
  to?: number
  label?: string
  createdAt: string
}
```

## Recommended MVP
Use line-level annotations first.

```ts
{
  documentId: 'note_123',
  actorType: 'agent',
  actorId: 'pi',
  kind: 'updated',
  anchorType: 'line',
  startLine: 12,
  endLine: 18,
  label: 'AI edited'
}
```

Line-level highlights are easier to maintain than raw offsets in markdown documents.

## CodeMirror Decoration Concepts

### Range Highlight

```ts
Decoration.mark({
  class: 'cm-ai-change'
}).range(from, to)
```

### Whole Line Highlight

```ts
Decoration.line({
  class: 'cm-ai-line'
}).range(line.from)
```

### Gutter Marker

```ts
class AiMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span')
    el.textContent = 'AI'
    el.className = 'cm-ai-gutter'
    return el
  }
}
```

## Suggested Styling

```css
.cm-ai-line {
  background: rgba(59, 130, 246, 0.08);
}

.cm-ai-change {
  background: rgba(59, 130, 246, 0.14);
  border-bottom: 1px solid rgba(59, 130, 246, 0.35);
}

.cm-ai-gutter {
  color: rgb(37, 99, 235);
  font-size: 10px;
  font-weight: 600;
}
```

## Storage Options

### Option 1: Line-Based Annotations

```txt
document_change_annotations
id
document_id
actor_type
actor_id
kind
start_line
end_line
label
created_at
```

Pros:
- simple
- good for markdown
- works well for section/paragraph edits

Cons:
- line numbers can drift after edits above the annotation

### Option 2: Offset-Based Annotations

```txt
document_change_annotations
id
document_id
actor_type
actor_id
kind
from_offset
to_offset
quoted_text
created_at
```

Pros:
- more precise

Cons:
- offsets drift when text changes before the range

### Option 3: Snapshot Diff
n
Store before/after snapshots for agent edits and compute highlights dynamically.

Pros:
- more accurate for generated diffs

Cons:
- heavier storage and computation

## Recommended Flow

```txt
agent edits document
  ↓
server stores annotation for affected lines/ranges
  ↓
client loads document + annotations
  ↓
CodeMirror renders highlights/gutter markers
```

## MinuEditor Integration Note
CodeMirror supports this directly, but if using a wrapper like `@dpklabs/minueditor`, confirm it exposes a way to pass CodeMirror extensions/decorations.

Ideal API shape:

```tsx
<MarkdownEditor
  value={markdown}
  onChange={setMarkdown}
  extensions={[aiHighlightExtension(annotations)]}
/>
```

If the wrapper does not expose extensions, add a wrapper prop or upstream extension API.

## MVP Recommendation
Start with:

- line-level AI annotations
- subtle line background
- optional gutter `AI` marker
- no hidden markdown metadata
- no operation history requirement

Improve anchoring later if needed.
