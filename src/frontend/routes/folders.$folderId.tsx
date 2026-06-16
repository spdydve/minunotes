import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder as FolderIcon, Lock } from "lucide-react";
import { ApiError, api, type Folder, type Note } from "../lib/api";
import { FolderActionsPopover } from "../components/folder-actions-popover";
import { NoteActionsPopover } from "../components/note-actions-popover";
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

function isEffectivelyAgentReadOnly(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current) {
    if (current.isAgentReadOnly) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

type FolderItem = { kind: "folder"; folder: Folder };
type NoteItem = { kind: "note"; note: Note };
type ContentItem = FolderItem | NoteItem;

function getContentItemUpdatedAt(item: ContentItem) {
  return item.kind === "folder" ? item.folder.updatedAt : item.note.updatedAt;
}

function getContentItemTitle(item: ContentItem) {
  return item.kind === "folder" ? item.folder.title : item.note.title;
}

function compareContentItemsByUpdatedDesc(a: ContentItem, b: ContentItem) {
  const updatedDiff = new Date(getContentItemUpdatedAt(b)).getTime() - new Date(getContentItemUpdatedAt(a)).getTime();
  return updatedDiff || getContentItemTitle(a).localeCompare(getContentItemTitle(b));
}

function FolderContentsTable({ items, allFolders, onDeleteNote }: { items: ContentItem[]; allFolders: Folder[]; onDeleteNote: (note: Note) => void }) {
  return <>
    <div className="space-y-2 md:hidden">
      {items.map((item) => item.kind === "folder" ? <div key={`folder-${item.folder.id}`} className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to="/folders/$folderId" params={{ folderId: item.folder.id }} className="flex min-w-0 flex-1 items-start gap-3">
            <span className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2 text-[var(--notes-muted)]"><FolderIcon className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2 font-medium hover:text-[var(--notes-blue)]">
                <span className="truncate">{item.folder.title}</span>
                {isEffectivelyPrivate(item.folder, allFolders) ? <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" aria-label="Private folder" /> : null}
                {!isEffectivelyPrivate(item.folder, allFolders) && isEffectivelyAgentReadOnly(item.folder, allFolders) ? <span className="shrink-0 rounded border border-amber-500/50 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-600">RO</span> : null}
              </span>
              <span className="mt-1 block text-xs text-[var(--notes-muted)]">Folder · Updated {new Date(item.folder.updatedAt).toLocaleString()}</span>
            </span>
          </Link>
          <FolderActionsPopover folder={item.folder} depth={folderDepth(item.folder, allFolders)} />
        </div>
      </div> : <div key={`note-${item.note.id}`} className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to="/notes/$noteId" params={{ noteId: item.note.id }} className="flex min-w-0 flex-1 items-start gap-3">
            <span className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2 text-[var(--notes-muted)]"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2 font-medium hover:text-[var(--notes-blue)]">
                <span className="truncate">{item.note.title}</span>
                {item.note.updatedByActorType === "agent" ? <span className="shrink-0 rounded border border-[var(--notes-blue)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--notes-blue)]">API</span> : null}
              </span>
              <span className="mt-1 block text-xs text-[var(--notes-muted)]">Note · Updated {new Date(item.note.updatedAt).toLocaleString()}</span>
            </span>
          </Link>
          <NoteActionsPopover note={item.note} onDelete={() => onDeleteNote(item.note)} />
        </div>
      </div>)}
    </div>

    <div className="hidden overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] md:block">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--notes-table-header-bg)]">
          <tr>
            <th className="border-b border-[var(--notes-border)] px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Name</th>
            <th className="border-b border-[var(--notes-border)] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Type</th>
            <th className="border-b border-[var(--notes-border)] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Updated</th>
            <th className="border-b border-[var(--notes-border)] px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <tr key={item.kind === "folder" ? `folder-${item.folder.id}` : `note-${item.note.id}`} className="transition-colors hover:bg-[var(--notes-table-row-hover)]">
            <td className="border-b border-[var(--notes-table-row-border)] px-5 py-3 align-middle">
              {item.kind === "folder" ? <Link to="/folders/$folderId" params={{ folderId: item.folder.id }} className="flex min-w-0 items-center gap-3 font-medium hover:text-[var(--notes-blue)]">
                <FolderIcon className="h-4 w-4 shrink-0 text-[var(--notes-muted)]" />
                <span className="truncate">{item.folder.title}</span>
                {isEffectivelyPrivate(item.folder, allFolders) ? <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" aria-label="Private folder" /> : null}
                {!isEffectivelyPrivate(item.folder, allFolders) && isEffectivelyAgentReadOnly(item.folder, allFolders) ? <span className="shrink-0 rounded border border-amber-500/50 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-600">RO</span> : null}
              </Link> : <Link to="/notes/$noteId" params={{ noteId: item.note.id }} className="flex min-w-0 items-center gap-3 font-medium hover:text-[var(--notes-blue)]">
                <FileText className="h-4 w-4 shrink-0 text-[var(--notes-muted)]" />
                <span className="truncate">{item.note.title}</span>
                {item.note.updatedByActorType === "agent" ? <span className="shrink-0 rounded border border-[var(--notes-blue)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--notes-blue)]">API</span> : null}
              </Link>}
            </td>
            <td className="border-b border-[var(--notes-table-row-border)] px-4 py-3 align-middle text-xs text-[var(--notes-muted)]">{item.kind === "folder" ? "Folder" : "Note"}</td>
            <td className="border-b border-[var(--notes-table-row-border)] px-4 py-3 align-middle text-xs text-[var(--notes-muted)]">{new Date(item.kind === "folder" ? item.folder.updatedAt : item.note.updatedAt).toLocaleString()}</td>
            <td className="border-b border-[var(--notes-table-row-border)] px-5 py-3 align-middle text-right">
              <div className="flex justify-end">{item.kind === "folder" ? <FolderActionsPopover folder={item.folder} depth={folderDepth(item.folder, allFolders)} /> : <NoteActionsPopover note={item.note} onDelete={() => onDeleteNote(item.note)} />}</div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
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
  const remove = useMutation({
    mutationFn: ({ noteId }: { noteId: string }) => api.deleteNote(noteId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["notes", folderId] });
      qc.invalidateQueries({ queryKey: ["note", variables.noteId] });
    },
  });

  if (isLoading) return <p className="notes-muted text-sm">Loading folder...</p>;
  if (error instanceof ApiError && error.status === 404) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Folder not found"><p>This folder does not exist or you do not have access to it.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;

  const allFolders = foldersData?.folders ?? [];
  const folder = allFolders.find((item) => item.id === folderId);
  const childFolders = allFolders.filter((item) => item.parentFolderId === folderId);
  const notes = data?.notes ?? [];
  const items: ContentItem[] = [...childFolders.map((child) => ({ kind: "folder" as const, folder: child })), ...notes.map((note) => ({ kind: "note" as const, note }))].sort(compareContentItemsByUpdatedDesc);

  return <section className="mx-auto w-full max-w-5xl">
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-semibold">{folder?.title ?? "Folder notes"}</h2>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={() => create.mutate()}>New note</Button>
        <Button variant="secondary" onClick={() => nav({ to: "/folders/$folderId/new-from-template", params: { folderId } })}>From template</Button>
        {folder ? <FolderActionsPopover folder={folder} depth={folderDepth(folder, allFolders)} /> : null}
      </div>
    </div>

    {items.length ? <FolderContentsTable items={items} allFolders={allFolders} onDeleteNote={(note) => remove.mutate({ noteId: note.id })} /> : <EmptyState>No folders or notes yet.</EmptyState>}
  </section>;
}

export const folderRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId", component: FolderView });
