import { MarkdownEditor, MarkdownRenderer } from "@dpklabs/minueditor";
import { useRef, useState, type ReactNode } from "react";
import { editorCodeLanguages } from "../lib/editor-languages";
import { Button } from "./ui/button";

export function NoteEditor({
  title,
  content,
  saveState,
  onTitleChange,
  onContentChange,
  onImageUpload,
  initialEditing = false,
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
  initialEditing?: boolean;
  actions: ReactNode;
  staleNotice?: ReactNode;
  updatedMeta?: ReactNode;
}) {
  const [editingBody, setEditingBody] = useState(initialEditing);
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
      <p className="notes-muted text-xs">{uploadingImage ? "Uploading image..." : saveLabel}</p>
      <div className="flex justify-end gap-2">
        {onImageUpload ? <>
          <input ref={imageInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={(e) => void handleImageChange(e.target.files?.[0])} />
          <Button type="button" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}>{uploadingImage ? "Uploading..." : "Upload image"}</Button>
        </> : null}
        {actions}
      </div>
    </div>
    {staleNotice}
    <input className="w-full bg-transparent text-3xl font-semibold outline-none" value={titleValue} onChange={(e) => onTitleChange(e.target.value)} placeholder="Untitled note" />
    {updatedMeta ? <div className="notes-muted mb-4 mt-2 text-xs">{updatedMeta}</div> : <div className="mb-4" />}
    <div className="border-t border-[var(--notes-border)] bg-[var(--notes-bg)]">
      {editingBody ? <MarkdownEditor
        value={content}
        onChange={onContentChange}
        placeholder="Start typing..."
        minHeight={520}
        codeLanguages={editorCodeLanguages}
        className="notes-minu-editor"
      /> : <MarkdownRenderer
        value={content || "Start typing..."}
        onClick={() => setEditingBody(true)}
        className={`notes-minu-renderer ${content ? "" : "notes-minu-renderer-placeholder"}`}
      />}
    </div>
  </section>;
}
