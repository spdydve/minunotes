import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api, type Folder } from "../lib/api";
import { Button } from "./ui/button";
import { FolderDestinationPicker, type FolderNode } from "./folder-destination-picker";

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
  const [destinationFolderId, setDestinationFolderId] = useState<string | null>(folder.parentFolderId);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["folders"], queryFn: api.folders, enabled: open });
  const folders = data?.folders ?? [];
  const height = useMemo(() => subtreeHeight(folder.id, folders), [folder.id, folders]);
  const currentParentId = folders.find((item) => item.id === folder.id)?.parentFolderId ?? folder.parentFolderId;
  const destinationFolder = destinationFolderId ? folders.find((item) => item.id === destinationFolderId) : null;
  const topLevelDisabledReason = height > 4 ? "Maximum folder depth reached" : null;
  const destinationDisabledReasonText = destinationFolder
    ? destinationDisabledReason({ ...destinationFolder, children: [], depth: getFolderDepth(destinationFolder, folders), effectivePrivate: isEffectivelyPrivate(destinationFolder, folders) }, folder, folders, height)
    : topLevelDisabledReason;

  const move = useMutation({
    mutationFn: () => api.moveFolder(folder.id, destinationFolderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to move folder"),
  });

  const close = () => {
    setError(null);
    setDestinationFolderId(currentParentId);
    onOpenChange(false);
  };

  if (!open) return null;

  return createPortal(<div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
    <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold">Move folder</h2>
      <p className="mt-1 text-sm text-[var(--notes-muted)]">Navigate to a destination, then choose Move here.</p>
      {error ? <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      {destinationDisabledReasonText ? <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{destinationDisabledReasonText}</p> : null}

      <div className="mt-4">
        <FolderDestinationPicker
          folders={folders}
          currentFolderId={destinationFolderId}
          onCurrentFolderIdChange={setDestinationFolderId}
          getDisabledReason={(destination) => destinationDisabledReason(destination, folder, folders, height)}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" onClick={close}>Cancel</Button>
        <Button type="button" disabled={move.isPending || destinationFolderId === currentParentId || Boolean(destinationDisabledReasonText)} onClick={() => { setError(null); move.mutate(); }}>Move here</Button>
      </div>
    </div>
  </div>, document.body);
}

function getFolderDepth(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let depth = 0;
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current.parentFolderId) {
    if (seen.has(current.id)) return Number.POSITIVE_INFINITY;
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
