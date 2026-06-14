import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder as FolderIcon, Lock } from "lucide-react";
import { ApiError, api, type Folder } from "../lib/api";
import { FolderActionsPopover } from "../components/folder-actions-popover";
import { NotesTable } from "../components/notes-table";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { rootRoute } from "./__root";

function folderDepth(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let depth = 0;
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current.parentFolderId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentFolderId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }

  return depth;
}

function isEffectivelyPrivate(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current) {
    if (current.isPrivate) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

function ChildFolderList({ folders, allFolders }: { folders: Folder[]; allFolders: Folder[] }) {
  if (folders.length === 0) return null;

  return <div className="mb-6">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Folders</h3>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) => {
        const privateFolder = isEffectivelyPrivate(folder, allFolders);
        return <div key={folder.id} className="group flex items-center gap-2 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-3 transition-colors hover:bg-[var(--notes-hover)]">
          <Link to="/folders/$folderId" params={{ folderId: folder.id }} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2 text-[var(--notes-muted)]">
              <FolderIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{folder.title}</span>
                {privateFolder ? <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" aria-label="Private folder" /> : null}
              </span>
              <span className="block text-xs text-[var(--notes-muted)]">Folder</span>
            </span>
          </Link>
          <FolderActionsPopover folder={folder} depth={folderDepth(folder, allFolders)} />
        </div>;
      })}
    </div>
  </div>;
}

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

  const allFolders = foldersData?.folders ?? [];
  const folder = allFolders.find((item) => item.id === folderId);
  const childFolders = allFolders.filter((item) => item.parentFolderId === folderId).sort((a, b) => a.title.localeCompare(b.title));
  const notes = data?.notes ?? [];
  const hasContent = childFolders.length > 0 || notes.length > 0;

  return <section className="mx-auto w-full max-w-5xl">
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-semibold">{folder?.title ?? "Folder notes"}</h2>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={() => create.mutate()}>New note</Button>
        <Button variant="secondary" onClick={() => nav({ to: "/folders/$folderId/new-from-template", params: { folderId } })}>From template</Button>
        {folder ? <FolderActionsPopover folder={folder} depth={folderDepth(folder, allFolders)} /> : null}
      </div>
    </div>

    <ChildFolderList folders={childFolders} allFolders={allFolders} />

    {notes.length ? <div>
      {childFolders.length > 0 ? <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Notes</h3> : null}
      <NotesTable notes={notes} />
    </div> : hasContent ? null : <EmptyState>No folders or notes yet.</EmptyState>}
  </section>;
}

export const folderRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId", component: FolderView });
