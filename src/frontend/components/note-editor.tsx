import { MarkdownEditor } from "@dpklabs/minueditor";
import { useState, type ReactNode } from "react";

export function NoteEditor({
  title,
  content,
  saveState,
  onTitleChange,
  onContentChange,
  actions,
  staleNotice,
}: {
  title: string;
  content: string;
  saveState?: "saved" | "saving" | "unsaved" | "error";
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  actions: ReactNode;
  staleNotice?: ReactNode;
}) {
  const [editingBody, setEditingBody] = useState(false);
  const titleValue = title === "Untitled note" ? "" : title;

  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed" : "Saved";

  return <section className="mx-auto w-full max-w-6xl">
    <div className="mb-4 flex items-center justify-between gap-2">
      <p className="text-xs text-slate-500">{saveLabel}</p>
      <div className="flex justify-end gap-2">{actions}</div>
    </div>
    {staleNotice}
    <input className="mb-4 w-full bg-transparent text-3xl font-semibold outline-none" value={titleValue} onChange={(e) => onTitleChange(e.target.value)} placeholder="Untitled note" />
    <div
      className="border-t bg-white dark:border-slate-800 dark:bg-slate-950"
      onPointerDownCapture={() => setEditingBody(true)}
      onFocusCapture={() => setEditingBody(true)}
    >
      <MarkdownEditor
        value={content}
        onChange={onContentChange}
        placeholder="Start typing..."
        readOnly={!editingBody}
        minHeight={520}
        floatingToolbar={editingBody}
        className="notes-minu-editor"
      />
    </div>
  </section>;
}
