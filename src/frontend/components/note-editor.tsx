import { MarkdownEditor } from "@dpklabs/minueditor";
import { useRef, useState, type ReactNode } from "react";

export function NoteEditor({
  title,
  content,
  saveState,
  onTitleChange,
  onContentChange,
  onImageUpload,
  actions,
  staleNotice,
  updatedMeta,
}: {
  title: string;
  content: string;
  saveState?: "saved" | "saving" | "unsaved" | "error";
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onImageUpload?: (file: File) => Promise<void> | void;
  actions: ReactNode;
  staleNotice?: ReactNode;
  updatedMeta?: ReactNode;
}) {
  const [editingBody, setEditingBody] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleValue = title === "Untitled note" ? "" : title;

  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed" : "Saved";

  const handleImageChange = async (file: File | undefined) => {
    if (!file || !onImageUpload) return;
    setUploadingImage(true);
    try {
      await onImageUpload(file);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  return <section className="mx-auto w-full max-w-6xl">
    <div className="mb-4 flex items-center justify-between gap-2">
      <p className="text-xs text-slate-500">{uploadingImage ? "Uploading image..." : saveLabel}</p>
      <div className="flex justify-end gap-2">
        {onImageUpload ? <>
          <input ref={imageInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={(e) => void handleImageChange(e.target.files?.[0])} />
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900" type="button" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}>{uploadingImage ? "Uploading..." : "Upload image"}</button>
        </> : null}
        {actions}
      </div>
    </div>
    {staleNotice}
    <input className="w-full bg-transparent text-3xl font-semibold outline-none" value={titleValue} onChange={(e) => onTitleChange(e.target.value)} placeholder="Untitled note" />
    {updatedMeta ? <div className="mb-4 mt-2 text-xs text-slate-500">{updatedMeta}</div> : <div className="mb-4" />}
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
