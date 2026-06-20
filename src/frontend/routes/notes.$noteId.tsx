import { createRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { BacklinksPanel } from "../components/backlinks-panel";
import { NoteActionsPopover } from "../components/note-actions-popover";
import { NoteEditor } from "../components/note-editor";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
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
  const { data: backlinksData, isLoading: backlinksLoading } = useQuery({
    queryKey: ["backlinks", noteId],
    queryFn: () => api.backlinks(noteId),
    enabled: Boolean(data?.note),
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
    if (!data?.note) return;
    document.title = `${data.note.title} - MinuNotes`;
  }, [data?.note]);

  useEffect(() => {
    if (hydratedNoteId.current !== noteId) return;
    document.title = `${title.trim() || "Untitled note"} - MinuNotes`;
  }, [noteId, title]);

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

  const applySavedNote = ({ note, contentHash }: { note: NonNullable<typeof data>["note"]; contentHash: string }) => {
    lastSaved.current = { title: note.title, content: note.content };
    lastKnownHash.current = contentHash;
    setSaveError(false);
    setIsStale(false);
    qc.setQueryData(["note", noteId], { note, contentHash });
    qc.invalidateQueries({ queryKey: [note.type === "template" ? "templates" : "notes", note.folderId] });
    qc.invalidateQueries({ queryKey: ["notes", "recent"] });
    if (note.type === "template") qc.invalidateQueries({ queryKey: ["templates"] });
    qc.invalidateQueries({ queryKey: ["note-events", noteId] });
    qc.invalidateQueries({ queryKey: ["backlinks"] });
  };

  const save = useMutation({
    mutationFn: (next: { title: string; content: string }) => api.saveNote(noteId, next),
    onSuccess: applySavedNote,
    onError: async (error, attempted) => {
      setSaveError(true);
      if (!(error instanceof ApiError) || error.status !== 409) return;

      const latest = await api.note(noteId).catch(() => null);
      if (!latest) {
        setIsStale(true);
        return;
      }

      lastKnownHash.current = latest.contentHash;
      qc.setQueryData(["note", noteId], latest);

      if (latest.note.title === attempted.title && latest.note.content === attempted.content) {
        applySavedNote(latest);
        return;
      }

      setIsStale(true);
    },
  });

  const remove = useMutation({ mutationFn: () => api.deleteNote(noteId), onSuccess: () => nav(data!.note.type === "template" ? { to: "/templates" } : { to: "/folders/$folderId", params: { folderId: data!.note.folderId } }) });
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
    return result.markdownUrl;
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
      if (status.contentHash !== lastKnownHash.current && !isDirty) setIsStale(true);
    };
    const timer = window.setInterval(checkStatus, 20_000);
    return () => window.clearInterval(timer);
  }, [noteId, save.isPending, isStale, isDirty]);

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

  const wikiLinks = useMemo(() => {
    const findExactNote = async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed) return null;
      const result = await api.searchNotes(trimmed, "note");
      const matches = result.notes.filter((note) => note.type === "note" && note.title === trimmed);
      return matches.length === 1 ? matches[0] : null;
    };

    return {
      enabled: true,
      openOnClick: true,
      suggest: async (query: string) => {
        const result = query.trim() ? await api.searchNotes(query.trim(), "note") : await api.recentNotes(8);
        return result.notes.filter((note) => note.id !== noteId && note.type === "note").slice(0, 8).map((note) => ({
          id: note.id,
          target: note.title,
          detail: "Note",
        }));
      },
      resolve: async (target: string) => {
        const note = await findExactNote(target).catch(() => null);
        return note ? { status: "resolved" as const, href: `/notes/${note.id}`, title: note.title } : { status: "unresolved" as const, title: target };
      },
      onOpen: (target: string) => {
        void findExactNote(target).then((note) => {
          if (note) void nav({ to: "/notes/$noteId", params: { noteId: note.id } });
        });
      },
    };
  }, [nav, noteId]);

  if (isLoading) return <p className="notes-muted text-sm">Loading note...</p>;
  if (error instanceof ApiError && error.status === 404) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Note not found"><p>This note does not exist or you do not have access to it.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;
  if (!data?.note) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Unable to load note"><p>Try again or return to your notes.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;
  if (hydratedNoteId.current !== noteId) return <p className="notes-muted text-sm">Loading note...</p>;

  const updatedMeta = data.note.type === "template"
    ? "Template"
    : data.note.updatedByActorType === "agent"
    ? `Last updated via API key${data.note.updatedByActorUid ? ` (${data.note.updatedByActorUid})` : ""}`
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
      headerExtra={<BacklinksPanel backlinks={backlinksData?.backlinks} isLoading={backlinksLoading} />}
      staleNotice={<>
        {isStale ? <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"><span>This note was updated elsewhere. Reload to view the latest version.</span><button className="rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900" onClick={reloadLatest}>Reload</button></div> : null}
        {imageUploadError ? <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{imageUploadError}</div> : null}
      </>}
      onImageUpload={uploadImage}
      wikiLinks={wikiLinks}
      actions={<NoteActionsPopover note={data.note} icon="settings" onDelete={() => remove.mutate()} onToggleApiEditable={() => toggleApiEditable.mutate()} />}
    />;
}

export const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/notes/$noteId", component: NoteView });
