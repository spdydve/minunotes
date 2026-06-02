import { createRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { NoteActionsPopover } from "../components/note-actions-popover";
import { NoteEditor } from "../components/note-editor";
import { rootRoute } from "./__root";

function NoteView() {
  const { noteId } = noteRoute.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => api.note(noteId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const hydratedNoteId = useRef<string | null>(null);
  const lastSaved = useRef({ title: "", content: "" });
  const lastKnownHash = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.note || hydratedNoteId.current === noteId) return;
    hydratedNoteId.current = noteId;
    setTitle(data.note.title);
    setContent(data.note.content);
    lastSaved.current = { title: data.note.title, content: data.note.content };
    lastKnownHash.current = data.contentHash;
    setSaveError(false);
    setImageUploadError(null);
    setIsStale(false);
  }, [data, noteId]);

  const save = useMutation({
    mutationFn: (next: { title: string; content: string }) => api.saveNote(noteId, { ...next, baseHash: lastKnownHash.current ?? undefined }),
    onSuccess: ({ note, contentHash }) => {
      lastSaved.current = { title: note.title, content: note.content };
      lastKnownHash.current = contentHash;
      setSaveError(false);
      setIsStale(false);
      qc.setQueryData(["note", noteId], { note, contentHash });
      qc.invalidateQueries({ queryKey: ["notes", note.folderId] });
      qc.invalidateQueries({ queryKey: ["note-events", noteId] });
    },
    onError: (error) => {
      setSaveError(true);
      if (error instanceof ApiError && error.status === 409) setIsStale(true);
    },
  });

  const remove = useMutation({ mutationFn: () => api.deleteNote(noteId), onSuccess: () => nav({ to: "/folders/$folderId", params: { folderId: data!.note.folderId } }) });
  const toggleApiEditable = useMutation({
    mutationFn: () => api.saveNote(noteId, { isApiEditable: !data!.note.isApiEditable }),
    onSuccess: ({ note, contentHash }) => {
      lastKnownHash.current = contentHash;
      qc.setQueryData(["note", noteId], { note, contentHash });
      qc.invalidateQueries({ queryKey: ["note-events", noteId] });
    },
  });

  const isDirty = title !== lastSaved.current.title || content !== lastSaved.current.content;
  const isSaving = save.isPending;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty || isSaving,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const saveState = useMemo<"saved" | "saving" | "unsaved" | "error">(() => {
    if (saveError) return "error";
    if (isSaving) return "saving";
    if (isDirty) return "unsaved";
    return "saved";
  }, [isDirty, isSaving, saveError]);

  const saveNow = () => {
    if (!isDirty || save.isPending || isStale) return;
    save.mutate({ title, content });
  };

  const uploadImage = async (file: File) => {
    setImageUploadError(null);
    const result = await api.uploadNoteImage(noteId, file).catch((error) => {
      setImageUploadError(error instanceof Error ? error.message : "Image upload failed");
      throw error;
    });
    setContent((current) => `${current}${current.trim() ? "\n\n" : ""}${result.markdown}`);
  };

  const reloadLatest = async () => {
    hydratedNoteId.current = null;
    setIsStale(false);
    setSaveError(false);
    await refetch();
  };

  useEffect(() => {
    if (!hydratedNoteId.current || !isDirty || save.isPending || isStale) return;
    const timer = window.setTimeout(() => save.mutate({ title, content }), 800);
    return () => window.clearTimeout(timer);
  }, [title, content, isDirty, isStale, save]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [title, content, isDirty, save.isPending]);

  useEffect(() => {
    if (!hydratedNoteId.current || save.isPending || isStale) return;
    const checkStatus = async () => {
      if (document.visibilityState !== "visible" || save.isPending || isStale) return;
      const status = await api.noteStatus(noteId).catch(() => null);
      if (!status || !lastKnownHash.current) return;
      if (status.contentHash !== lastKnownHash.current) setIsStale(true);
    };
    const timer = window.setInterval(checkStatus, 20_000);
    return () => window.clearInterval(timer);
  }, [noteId, save.isPending, isStale]);

  useEffect(() => {
    if (blocker.status !== "blocked") return;
    if (save.isPending) return;
    if (isDirty) {
      saveNow();
      return;
    }
    blocker.proceed?.();
  }, [blocker, isDirty, title, content, save.isPending]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty && !save.isPending) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, save.isPending]);
  if (isLoading) return <p className="text-sm text-slate-500">Loading note...</p>;
  if (error instanceof ApiError && error.status === 404) return <section className="grid min-h-[60vh] place-items-center"><div className="w-full max-w-lg rounded-lg border border-dashed p-8 text-center"><h2 className="text-xl font-semibold">Note not found</h2><p className="mt-2 text-sm text-slate-500">This note does not exist or you do not have access to it.</p><button className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900" onClick={() => nav({ to: "/" })}>Back to notes</button></div></section>;
  if (!data?.note) return <section className="grid min-h-[60vh] place-items-center"><div className="w-full max-w-lg rounded-lg border border-dashed p-8 text-center"><h2 className="text-xl font-semibold">Unable to load note</h2><p className="mt-2 text-sm text-slate-500">Try again or return to your notes.</p><button className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900" onClick={() => nav({ to: "/" })}>Back to notes</button></div></section>;

  const updatedMeta = data.note.updatedByActorType === "agent"
    ? `Last updated via API key${data.note.updatedByActorId ? ` (${data.note.updatedByActorId})` : ""}`
    : data.note.updatedByActorType === "system"
      ? "Last updated by system"
      : null;

  return <NoteEditor
    key={noteId}
    title={title}
    content={content}
    saveState={saveState}
    onTitleChange={setTitle}
    onContentChange={setContent}
    initialEditing={!data.note.content.trim()}
    updatedMeta={updatedMeta}
    staleNotice={<>
      {isStale ? <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"><span>This note was updated elsewhere. Reload to view the latest version.</span><button className="rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900" onClick={reloadLatest}>Reload</button></div> : null}
      {imageUploadError ? <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{imageUploadError}</div> : null}
    </>}
    onImageUpload={uploadImage}
    actions={<NoteActionsPopover note={data.note} icon="settings" onDelete={() => remove.mutate()} onToggleApiEditable={() => toggleApiEditable.mutate()} />}
  />;
}

export const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/notes/$noteId", component: NoteView });
