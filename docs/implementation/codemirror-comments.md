# CodeMirror Comments and Threads

## Goal
Render comments attached to markdown lines or text ranges without storing hidden metadata inside the markdown.

## Core Idea
Comments are external metadata anchored to the current markdown document.

```txt
markdown = source of truth
comments = external metadata
CodeMirror = decoration/rendering surface
```

## MVP Comment Model

```ts
export interface DocumentComment {
  id: string
  documentId: string
  authorId: string
  status: 'open' | 'resolved'
  anchorType: 'line' | 'range'
  startLine?: number
  endLine?: number
  from?: number
  to?: number
  quotedText?: string
  body: string
  createdAt: string
  updatedAt: string
}
```

For threaded comments:

```ts
export interface DocumentCommentReply {
  id: string
  commentId: string
  authorId: string
  body: string
  createdAt: string
  updatedAt: string
}
```

## Recommended MVP
Use line-based comments first.

```ts
{
  documentId: 'note_123',
  anchorType: 'line',
  startLine: 8,
  endLine: 10,
  body: 'Can we clarify this section?',
  status: 'open'
}
```

This is simpler than maintaining precise offsets during active markdown editing.

## CodeMirror Rendering Options

### Highlight Commented Range

```ts
Decoration.mark({
  class: 'cm-comment-range'
}).range(from, to)
```

### Highlight Commented Line

```ts
Decoration.line({
  class: 'cm-comment-line'
}).range(line.from)
```

### Gutter Marker

```ts
class CommentMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span')
    el.textContent = '💬'
    el.className = 'cm-comment-gutter'
    return el
  }
}
```

### Inline Widget

Use a CodeMirror widget decoration for small inline comment controls.

```ts
Decoration.widget({
  widget: new CommentWidget(comment),
  side: 1
}).range(position)
```

## Suggested Styling

```css
.cm-comment-line {
  background: rgba(245, 158, 11, 0.08);
}

.cm-comment-range {
  background: rgba(245, 158, 11, 0.16);
  border-bottom: 1px solid rgba(245, 158, 11, 0.45);
}

.cm-comment-gutter {
  font-size: 12px;
  cursor: pointer;
}
```

## Comment UI Patterns

### Popover
Click a highlighted range or gutter icon to open a small thread popover.

Best for simple comments.

### Sidebar
Show comments in a side panel aligned with editor ranges.

Best for longer documents and threaded discussion.

### Inline Widget
Show a small comment button near the selected text.

Best for quick add/reply actions.

## Anchoring Strategies

### 1. Line-Based Anchors

```txt
start_line
end_line
```

Pros:
- simple
- good for markdown sections/paragraphs
- easy to render

Cons:
- lines drift when content is inserted above

### 2. Offset-Based Anchors

```txt
from_offset
to_offset
quoted_text
```

Pros:
- precise

Cons:
- offsets drift after edits

### 3. Resilient Anchors

```txt
from_offset
to_offset
quoted_text
context_before
context_after
```

On document changes, relocate comment by searching for:

1. exact quoted text
2. quoted text near previous offset
3. context before/after
4. fuzzy match fallback

Pros:
- closer to Google Docs/Confluence behavior

Cons:
- more complex

## Suggested Tables

### `document_comments`

```txt
id
document_id
author_id
status
anchor_type
start_line
end_line
from_offset
to_offset
quoted_text
context_before
context_after
body
created_at
updated_at
```

### `document_comment_replies`

```txt
id
comment_id
author_id
body
created_at
updated_at
```

## Recommended Flow

```txt
user selects text or line
  ↓
client creates comment with anchor metadata
  ↓
server persists comment outside markdown
  ↓
client loads document + comments
  ↓
CodeMirror renders highlights/gutter markers
  ↓
click marker opens comment thread
```

## MinuEditor Integration Note
CodeMirror can render comments with decorations, gutters, and widgets. If using `@dpklabs/minueditor`, confirm it exposes CodeMirror extension injection.

Ideal API shape:

```tsx
<MarkdownEditor
  value={markdown}
  onChange={setMarkdown}
  extensions={[commentExtension(comments)]}
/>
```

If not available, add wrapper support for extensions/decorations.

## MVP Recommendation
Start with:

- line-based comments
- open/resolved status
- gutter comment icon
- subtle line/range highlight
- popover or sidebar thread UI
- comments stored outside markdown

Improve anchoring later if comments become a core workflow.
