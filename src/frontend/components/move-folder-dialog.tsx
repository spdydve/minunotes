import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder as FolderIcon, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api, type Folder } from "../lib/api";
import { Button } from "./ui/button";

type FolderNode = Folder & { children: FolderNode[]; depth: number; effectivePrivate: boolean };

function buildFolderRows(folders: Folder[]) {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [], depth: 0, effectivePrivate: folder.isPrivate } as FolderNode]));
  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentFolderId ? nodes.get(node.parentFolderId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rows: FolderNode[] = [];
  const visit = (node: FolderNode, depth: number, parentPrivate: boolean) => {
    node.depth = depth;
    node.effectivePrivate = parentPrivate || node.isPrivate;
    rows.push(node);
    node.children.sort((a, b) => a.title.localeCompare(b.title));
    for (const child of node.children) visit(child, depth + 1, node.effectivePrivate);
  };

  roots.sort((a, b) => a.title.localeCompare(b.title));
  for (const root of roots) visit(root, 0, false);
  return rows;
}

function isDescendantOrSelf(folderId: string, rootFolderId: string, folders: Folder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.id === rootFolderId) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

function subtreeHeight(folderId: string, folders: Folder[]) {
  const childrenByParent = new Map<string, Folder[]>();
  for (const folder of folders) {
    if (!folder.parentFolderId) continue;
    const children = childrenByParent.get(folder.parentFolderId) ?? [];
    children.push(folder);
    childrenByParent.set(folder.parentFolderId, children);
  }

  const visit = (id: string): number => {
    const children = childrenByParent.get(id) ?? [];
    if (!children.length) return 0;
    return Math.max(...children.map((child) => 1 + visit(child.id)));
  };

  return visit(folderId);
}

function destinationDisabledReason(destination: FolderNode, folder: Folder, folders: Folder[], height: number) {
  if (destination.id === folder.id) return "Cannot move a folder into itself";
  if (isDescendantOrSelf(destination.id, folder.id, folders)) return "Cannot move a folder into its descendant";
  if (destination.effectivePrivate) return "Cannot move folders under a private folder";
  if (destination.depth + 1 + height > 4) return "Maximum folder depth reached";
  return null;
}

export function MoveFolderDialog({ folder, open, onOpenChange }: { folder: Folder; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(folder.parentFolderId);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["folders"], queryFn: api.folders, enabled: open });
  const folders = data?.folders ?? [];
  const rows = useMemo(() => buildFolderRows(folders), [folders]);
  const height = useMemo(() => subtreeHeight(folder.id, folders), [folder.id, folders]);
  const currentParentId = folders.find((item) => item.id === folder.id)?.parentFolderId ?? folder.parentFolderId;
  const topLevelDisabled = height > 4;
  const selectedDestination = selectedParentId ? rows.find((item) => item.id === selectedParentId) : null;
  const selectedDisabledReason = selectedDestination ? destinationDisabledReason(selectedDestination, folder, folders, height) : topLevelDisabled ? "Maximum folder depth reached" : null;

  const move = useMutation({
    mutationFn: () => api.moveFolder(folder.id, selectedParentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to move folder"),
  });

  const close = () => {
    setError(null);
    setSelectedParentId(currentParentId);
    onOpenChange(false);
  };

  if (!open) return null;

  return createPortal(<div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
    <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold">Move folder</h2>
      <p className="mt-1 text-sm text-[var(--notes-muted)]">Choose a new location for {folder.title}.</p>
      {error ? <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-2">
        <label className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${topLevelDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--notes-hover)]"}`}>
          <input type="radio" name="folder-destination" checked={selectedParentId === null} disabled={topLevelDisabled} onChange={() => setSelectedParentId(null)} />
          <FolderIcon className="h-4 w-4 text-[var(--notes-muted)]" />
          <span>Top level</span>
        </label>
        {rows.map((destination) => {
          const disabledReason = destinationDisabledReason(destination, folder, folders, height);
          return <label key={destination.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${disabledReason ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--notes-hover)]"}`} title={disabledReason ?? undefined} style={{ paddingLeft: `${0.75 + destination.depth * 0.75}rem` }}>
            <input type="radio" name="folder-destination" checked={selectedParentId === destination.id} disabled={Boolean(disabledReason)} onChange={() => setSelectedParentId(destination.id)} />
            <FolderIcon className="h-4 w-4 shrink-0 text-[var(--notes-muted)]" />
            <span className="min-w-0 flex-1 truncate">{destination.title}</span>
            {destination.effectivePrivate ? <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" /> : null}
          </label>;
        })}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" onClick={close}>Cancel</Button>
        <Button type="button" disabled={move.isPending || selectedParentId === currentParentId || Boolean(selectedDisabledReason)} onClick={() => { setError(null); move.mutate(); }}>Move</Button>
      </div>
    </div>
  </div>, document.body);
}
