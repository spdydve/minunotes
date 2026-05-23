import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { NotesTable } from "../components/notes-table";
import { Button } from "../components/ui/button";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
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
  return <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Folder notes</h2><div className="flex gap-2"><Button onClick={() => create.mutate()}>New note</Button><DeleteConfirmDialog label="folder" warning="All notes in this folder will be permanently lost." onConfirm={() => remove.mutate()} /></div></div>{isLoading ? <p>Loading...</p> : error instanceof ApiError && error.status === 404 ? <p className="rounded-lg border border-dashed p-8 text-sm text-slate-500">Folder not found.</p> : data?.notes.length ? <NotesTable notes={data.notes} /> : <p className="rounded-lg border border-dashed p-8 text-sm text-slate-500">No notes yet.</p>}</section>;
}

export const folderRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId", component: FolderView });
