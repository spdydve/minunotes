import type { ReactNode } from "react";
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
  return <section className="mx-auto max-w-4xl">
    <div className="mb-4 flex justify-end gap-2">
      <Button onClick={onSave} disabled={saving}>Save</Button>
      {deleteAction}
    </div>
    <input className="mb-4 w-full bg-transparent text-3xl font-semibold outline-none" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Untitled note" />
    <textarea className="min-h-[65vh] w-full resize-none rounded-lg border bg-white p-4 outline-none dark:border-slate-800 dark:bg-slate-950" value={content} onChange={(e) => onContentChange(e.target.value)} placeholder="Start typing..." />
  </section>;
}
