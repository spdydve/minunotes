import { MarkdownEditor } from "@dpklabs/minueditor";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";

export function NoteEditor({
  title,
  content,
  saving,
  onTitleChange,
  onContentChange,
  onSave,
  deleteAction,
}: {
  title: string;
  content: string;
  saving?: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
  deleteAction: ReactNode;
}) {
  const [editingBody, setEditingBody] = useState(false);
  const titleValue = title === "Untitled note" ? "" : title;

  return <section className="mx-auto w-full max-w-6xl">
    <div className="mb-4 flex justify-end gap-2">
      <Button onClick={onSave} disabled={saving}>Save</Button>
      {deleteAction}
    </div>
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
