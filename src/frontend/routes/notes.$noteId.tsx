import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
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
  useEffect(() => { if (data?.note) { setTitle(data.note.title); setContent(data.note.content); } }, [data]);
  const save = useMutation({ mutationFn: () => api.saveNote(noteId, { title, content }), onSuccess: ({ note }) => { qc.invalidateQueries({ queryKey: ["note", noteId] }); qc.invalidateQueries({ queryKey: ["notes", note.folderId] }); } });
  const remove = useMutation({ mutationFn: () => api.deleteNote(noteId), onSuccess: () => nav({ to: "/folders/$folderId", params: { folderId: data!.note.folderId } }) });
  useEffect(() => { const fn = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save.mutate(); } }; window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn); }, [save]);
  if (isLoading) return <p className="text-sm text-slate-500">Loading note...</p>;
  if (error instanceof ApiError && error.status === 404) return <div className="rounded-lg border border-dashed p-8 text-sm text-slate-500">Note not found.</div>;
  if (!data?.note) return <div className="rounded-lg border border-dashed p-8 text-sm text-slate-500">Unable to load note.</div>;

  return <NoteEditor
    key={noteId}
    title={title}
    content={content}
    saving={save.isPending}
    onTitleChange={setTitle}
    onContentChange={setContent}
    onSave={() => save.mutate()}
    deleteAction={<DeleteConfirmDialog label="note" warning="This note will be permanently lost." onConfirm={() => remove.mutate()} />}
  />;
}

export const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/notes/$noteId", component: NoteView });
