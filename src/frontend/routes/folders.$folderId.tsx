import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { FolderActionsPopover } from "../components/folder-actions-popover";
import { NotesTable } from "../components/notes-table";
import { Button } from "../components/ui/button";
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
  const { data: foldersData } = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const create = useMutation({
    mutationFn: () => api.createNote(folderId),
    onSuccess: ({ note }) => {
      qc.invalidateQueries({ queryKey: ["notes", folderId] });
      qc.invalidateQueries({ queryKey: ["notes", "recent"] });
      nav({ to: "/notes/$noteId", params: { noteId: note.id } });
    },
  });
  if (isLoading) return <p className="notes-muted text-sm">Loading folder...</p>;
  if (error instanceof ApiError && error.status === 404) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Folder not found"><p>This folder does not exist or you do not have access to it.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;

  const folder = foldersData?.folders.find((item) => item.id === folderId);

  return <section className="mx-auto w-full max-w-5xl"><div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-semibold">{folder?.title ?? "Folder notes"}</h2><div className="flex flex-wrap items-center justify-end gap-2"><Button onClick={() => create.mutate()}>New note</Button><Button variant="secondary" onClick={() => nav({ to: "/folders/$folderId/new-from-template", params: { folderId } })}>From template</Button>{folder ? <FolderActionsPopover folder={folder} /> : null}</div></div>{data?.notes.length ? <NotesTable notes={data.notes} /> : <EmptyState>No notes yet.</EmptyState>}</section>;
}

export const folderRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId", component: FolderView });
