import { ChevronRight, Folder as FolderIcon, Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Folder } from '../lib/api';

type FolderNode = Folder & {
  children: FolderNode[];
  depth: number;
  effectivePrivate: boolean;
  effectiveAgentReadOnly: boolean;
};

function buildFolderRows(folders: Folder[]) {
  const nodes = new Map(
    folders.map((folder) => [
      folder.id,
      {
        ...folder,
        children: [],
        depth: 0,
        effectivePrivate: folder.isPrivate,
        effectiveAgentReadOnly: folder.isAgentReadOnly,
      } as FolderNode,
    ])
  );
  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentFolderId ? nodes.get(node.parentFolderId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rows: FolderNode[] = [];
  const visit = (node: FolderNode, depth: number, parentPrivate: boolean, parentAgentReadOnly: boolean) => {
    node.depth = depth;
    node.effectivePrivate = parentPrivate || node.isPrivate;
    node.effectiveAgentReadOnly = parentAgentReadOnly || node.isAgentReadOnly;
    rows.push(node);
    node.children.sort((a, b) => a.title.localeCompare(b.title));
    for (const child of node.children) visit(child, depth + 1, node.effectivePrivate, node.effectiveAgentReadOnly);
  };

  roots.sort((a, b) => a.title.localeCompare(b.title));
  for (const root of roots) visit(root, 0, false, false);
  return rows;
}

function getBreadcrumb(folderId: string | null, byId: Map<string, Folder>) {
  if (!folderId) return [];
  const path: Folder[] = [];
  let current = byId.get(folderId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    path.unshift(current);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return path;
}

export function FolderDestinationPicker({
  folders,
  currentFolderId,
  onCurrentFolderIdChange,
  allowTopLevel = true,
  getDisabledReason,
}: {
  folders: Folder[];
  currentFolderId: string | null;
  onCurrentFolderIdChange: (folderId: string | null) => void;
  allowTopLevel?: boolean;
  getDisabledReason?: (folder: FolderNode) => string | null;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => buildFolderRows(folders), [folders]);
  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const currentChildren = rows.filter((folder) => folder.parentFolderId === currentFolderId);
  const breadcrumbs = getBreadcrumb(currentFolderId, byId);
  const searchResults = query.trim()
    ? rows.filter((folder) => folder.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 20)
    : [];
  const visibleRows = query.trim() ? searchResults : currentChildren;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--notes-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!allowTopLevel}
          onClick={() => onCurrentFolderIdChange(null)}
        >
          Root
        </button>
        {breadcrumbs.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-[var(--notes-muted)]" />
            <button
              type="button"
              className="max-w-32 truncate rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--notes-hover)]"
              onClick={() => onCurrentFolderIdChange(folder.id)}
            >
              {folder.title}
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--notes-muted)]" />
        <input
          className="notes-input w-full rounded-md py-2 pl-9 pr-3"
          placeholder="Search folders"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[var(--notes-border)] p-1">
        {visibleRows.length ? (
          visibleRows.map((folder) => {
            const disabledReason = getDisabledReason?.(folder) ?? null;
            return (
              <button
                key={folder.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${disabledReason ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--notes-hover)]'}`}
                title={disabledReason ?? undefined}
                disabled={Boolean(disabledReason)}
                onClick={() => {
                  setQuery('');
                  onCurrentFolderIdChange(folder.id);
                }}
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-[var(--notes-muted)]" />
                <span className="min-w-0 flex-1 truncate">{folder.title}</span>
                {folder.effectivePrivate ? (
                  <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" aria-label="Private folder" />
                ) : null}
                {!folder.effectivePrivate && folder.effectiveAgentReadOnly ? (
                  <span className="shrink-0 rounded border border-amber-500/50 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-600">
                    RO
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--notes-muted)]" />
              </button>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-sm text-[var(--notes-muted)]">
            {query.trim() ? 'No matching folders.' : 'No folders here.'}
          </p>
        )}
      </div>
    </div>
  );
}

export type { FolderNode };
