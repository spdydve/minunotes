import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { NotesTable } from "../components/notes-table";
import { Button } from "../components/ui/button";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { rootRoute } from "./__root";

function FolderView() {
  const { folderId } = folderRoute.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["notes", folderId],
    queryFn: () => api.notes(folderId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const create = useMutation({ mutationFn: () => api.createNote(folderId), onSuccess: ({ note }) => nav({ to: "/notes/$noteId", params: { noteId: note.id } }) });
  const remove = useMutation({ mutationFn: () => api.deleteFolder(folderId), onSuccess: () => { qc.invalidateQueries({ queryKey: ["folders"] }); nav({ to: "/" }); } });
  if (isLoading) return <p className="notes-muted text-sm">Loading folder...</p>;
  if (error instanceof ApiError && error.status === 404) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Folder not found"><p>This folder does not exist or you do not have access to it.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;

  return <section className="mx-auto w-full max-w-5xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">Folder notes</h2><div className="flex gap-2"><Button onClick={() => create.mutate()}>New note</Button><DeleteConfirmDialog label="folder" warning="All notes in this folder will be permanently lost." onConfirm={() => remove.mutate()} /></div></div>{data?.notes.length ? <NotesTable notes={data.notes} /> : <EmptyState>No notes yet.</EmptyState>}</section>;
}

export const folderRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId", component: FolderView });
