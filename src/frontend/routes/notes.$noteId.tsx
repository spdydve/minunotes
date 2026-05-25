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
  const { data, error, isLoading } = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => api.note(noteId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveError, setSaveError] = useState(false);
  const hydratedNoteId = useRef<string | null>(null);
  const lastSaved = useRef({ title: "", content: "" });

  useEffect(() => {
    if (!data?.note || hydratedNoteId.current === noteId) return;
    hydratedNoteId.current = noteId;
    setTitle(data.note.title);
    setContent(data.note.content);
    lastSaved.current = { title: data.note.title, content: data.note.content };
    setSaveError(false);
  }, [data, noteId]);

  const save = useMutation({
    mutationFn: (next: { title: string; content: string }) => api.saveNote(noteId, next),
    onSuccess: ({ note }) => {
      lastSaved.current = { title: note.title, content: note.content };
      setSaveError(false);
      qc.setQueryData(["note", noteId], { note });
      qc.invalidateQueries({ queryKey: ["notes", note.folderId] });
    },
    onError: () => setSaveError(true),
  });

  const remove = useMutation({ mutationFn: () => api.deleteNote(noteId), onSuccess: () => nav({ to: "/folders/$folderId", params: { folderId: data!.note.folderId } }) });

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
    if (!isDirty || save.isPending) return;
    save.mutate({ title, content });
  };

  useEffect(() => {
    if (!hydratedNoteId.current || !isDirty || save.isPending) return;
    const timer = window.setTimeout(() => save.mutate({ title, content }), 800);
    return () => window.clearTimeout(timer);
  }, [title, content, isDirty, save]);

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

  return <NoteEditor
    key={noteId}
    title={title}
    content={content}
    saveState={saveState}
    onTitleChange={setTitle}
    onContentChange={setContent}
    actions={<NoteActionsPopover note={data.note} icon="settings" onDelete={() => remove.mutate()} />}
  />;
}

export const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/notes/$noteId", component: NoteView });
