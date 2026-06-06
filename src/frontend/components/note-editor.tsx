import { defaultSlashCommands, MarkdownEditor, type MarkdownEditorHandle, type SlashCommand } from "@dpklabs/minueditor";
import { Heading1, Heading2, Heading3, Image, List, ListChecks, ListOrdered, Plus, Quote, Redo2, Table2, Type, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { editorCodeLanguages } from "../lib/editor-languages";

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
  onImageUpload?: (file: File) => Promise<string> | string;
  initialEditing?: boolean;
  actions: ReactNode;
  staleNotice?: ReactNode;
  updatedMeta?: ReactNode;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageTab, setImageTab] = useState<"upload" | "link">("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleValue = title === "Untitled note" ? "" : title;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
    };
  }, []);

  const saveLabel =
    saveState === "saving"
      ? "Saving..."
      : saveState === "unsaved"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Save failed"
          : "Saved";

  const insertMarkdown = (markdown: string) => {
    editorRef.current?.insertMarkdown(markdown);
    setBlockMenuOpen(false);
  };

  const blockItems = [
    { label: "Text", icon: Type, markdown: "" },
    { label: "Heading 1", icon: Heading1, markdown: "# " },
    { label: "Heading 2", icon: Heading2, markdown: "## " },
    { label: "Heading 3", icon: Heading3, markdown: "### " },
    { label: "Bulleted list", icon: List, markdown: "- " },
    { label: "Numbered list", icon: ListOrdered, markdown: "1. " },
    { label: "To-do list", icon: ListChecks, markdown: "- [ ] " },
    { label: "Quote", icon: Quote, markdown: "> " },
    { label: "Table", icon: Table2, markdown: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |" },
  ];

  const openImagePicker = () => {
    setImagePickerError(null);
    setImagePickerOpen(true);
  };

  const closeImagePicker = () => {
    setImagePickerOpen(false);
    setImagePickerError(null);
    setImageUrl("");
    setImageAlt("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const uploadImageFile = async (file: File | undefined) => {
    if (!file || !onImageUpload) return;
    setImagePickerError(null);
    setUploadingImage(true);
    try {
      const src = await onImageUpload(file);
      editorRef.current?.insertImage({ src, alt: imageAlt.trim() || file.name });
      closeImagePicker();
    } catch (error) {
      setImagePickerError(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const insertLinkedImage = () => {
    const src = imageUrl.trim();
    if (!src) return;
    editorRef.current?.insertImage({ src, alt: imageAlt.trim() });
    closeImagePicker();
  };

  const slashCommands: readonly SlashCommand[] = defaultSlashCommands.map((command) =>
    command.label === "Image"
      ? {
          ...command,
          run: () => {
            openImagePicker();
            return true;
          },
        }
      : command,
  );

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="sticky -top-4 z-20 -mt-4 border-b border-[var(--notes-border)] bg-[var(--notes-bg)] pb-4 pt-4 sm:-top-6 sm:-mt-6 sm:pt-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="notes-muted text-xs">
            {uploadingImage ? "Uploading image..." : saveLabel}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {actions}
          </div>
        </div>
        {staleNotice}
        <input
          className="w-full bg-transparent text-2xl font-semibold outline-none sm:text-3xl"
          value={titleValue}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled note"
        />
        {updatedMeta ? (
          <div className="notes-muted mt-2 text-xs">{updatedMeta}</div>
        ) : null}
      </div>
      <div className="overflow-x-hidden bg-[var(--notes-bg)] pb-20 sm:pb-24">
        <MarkdownEditor
          ref={editorRef}
          value={content}
          onChange={onContentChange}
          placeholder="Start typing..."
          minHeight={520}
          codeLanguages={editorCodeLanguages}
          slashCommands={slashCommands}
          onImageUpload={onImageUpload ? async (file) => {
            setUploadingImage(true);
            try {
              return await onImageUpload(file);
            } finally {
              setUploadingImage(false);
            }
          } : undefined}
          onViewReady={(view) => {
            setEditorReady(true);
            if (!initialEditing && view.hasFocus) view.contentDOM.blur();
          }}
          className="notes-minu-editor"
        />
      </div>
      {imagePickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-3 sm:place-items-center sm:p-6">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--notes-border)] px-4 py-3">
              <h2 className="text-sm font-semibold">Add an image</h2>
              <button type="button" className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" onClick={closeImagePicker} aria-label="Close image picker">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1 border-b border-[var(--notes-border)] px-4">
              <button type="button" className={`border-b-2 px-3 py-2 text-sm font-medium ${imageTab === "upload" ? "border-[var(--notes-blue)] text-[var(--notes-text)]" : "border-transparent text-[var(--notes-muted)] hover:text-[var(--notes-text)]"}`} onClick={() => setImageTab("upload")}>Upload</button>
              <button type="button" className={`border-b-2 px-3 py-2 text-sm font-medium ${imageTab === "link" ? "border-[var(--notes-blue)] text-[var(--notes-text)]" : "border-transparent text-[var(--notes-muted)] hover:text-[var(--notes-text)]"}`} onClick={() => setImageTab("link")}>Link</button>
            </div>
            <div className="space-y-3 p-4">
              <input className="w-full rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--notes-blue)]" placeholder="Alt text optional" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
              {imageTab === "upload" ? (
                <div>
                  <input ref={imageInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => void uploadImageFile(event.target.files?.[0])} />
                  <button type="button" className="w-full rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-3 text-sm font-semibold hover:bg-[var(--notes-hover)] disabled:cursor-not-allowed disabled:opacity-50" disabled={uploadingImage || !onImageUpload} onClick={() => imageInputRef.current?.click()}>
                    {uploadingImage ? "Uploading..." : "Upload file"}
                  </button>
                  <p className="mt-2 text-center text-xs text-[var(--notes-muted)]">Choose an image from your device</p>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); insertLinkedImage(); }}>
                  <input className="w-full rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--notes-blue)]" type="url" placeholder="Paste the image link…" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
                  <button type="submit" className="w-full rounded-lg border border-[var(--notes-blue)] bg-[var(--notes-blue)] px-3 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!imageUrl.trim()}>Embed image</button>
                  <p className="text-center text-xs text-[var(--notes-muted)]">Works with any image from the web</p>
                </form>
              )}
              {imagePickerError ? <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{imagePickerError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-3 z-40 px-3 sm:bottom-4 sm:px-6 md:left-72 md:right-0" style={keyboardOffset ? { bottom: keyboardOffset + 12 } : undefined}>
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          {blockMenuOpen ? (
            <div className="mb-3 rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)]/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-[var(--notes-panel)]/85">
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Basic blocks</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {blockItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" className="flex items-center gap-3 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-3 text-left text-sm font-medium hover:bg-[var(--notes-hover)]" onPointerDown={(event) => { event.preventDefault(); insertMarkdown(item.markdown); }}>
                      <Icon className="h-5 w-5 text-[var(--notes-muted)]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--notes-border)] bg-[var(--notes-panel)]/95 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-[var(--notes-panel)]/85">
            <button type="button" className="rounded-full p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" aria-label={blockMenuOpen ? "Close block menu" : "Open block menu"} onClick={() => setBlockMenuOpen((open) => !open)}>
              {blockMenuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>
            <button type="button" className="rounded-full p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" aria-label="Undo" onPointerDown={(event) => { event.preventDefault(); editorRef.current?.undo(); }}>
              <Undo2 className="h-5 w-5" />
            </button>
            <button type="button" className="rounded-full p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" aria-label="Redo" onPointerDown={(event) => { event.preventDefault(); editorRef.current?.redo(); }}>
              <Redo2 className="h-5 w-5" />
            </button>
            {onImageUpload ? (
              <button type="button" className="rounded-full p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)] disabled:opacity-50" aria-label="Insert image" disabled={uploadingImage || !editorReady} onPointerDown={(event) => { event.preventDefault(); openImagePicker(); }}>
                <Image className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
