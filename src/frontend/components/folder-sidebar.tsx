import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Lock, PanelLeftClose } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Folder } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { CreateFolderDialog } from "./create-folder-dialog";
import { FolderActionsPopover } from "./folder-actions-popover";
import { SearchDialog } from "./search-dialog";
import { ThemeSelect } from "./theme-select";
import { ActionMenuButton, ActionMenuIconButton } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type FolderNode = Folder & { children: FolderNode[]; depth: number; effectivePrivate: boolean; effectiveAgentReadOnly: boolean };

function buildFolderTree(folders: Folder[]) {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [], depth: 0, effectivePrivate: folder.isPrivate, effectiveAgentReadOnly: folder.isAgentReadOnly } as FolderNode]));
  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentFolderId ? nodes.get(node.parentFolderId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: FolderNode[]) => items.sort((a, b) => a.title.localeCompare(b.title));
  const visit = (node: FolderNode, depth: number, parentPrivate: boolean, parentAgentReadOnly: boolean) => {
    node.depth = depth;
    node.effectivePrivate = parentPrivate || node.isPrivate;
    node.effectiveAgentReadOnly = parentAgentReadOnly || node.isAgentReadOnly;
    sortNodes(node.children);
    for (const child of node.children) visit(child, depth + 1, node.effectivePrivate, node.effectiveAgentReadOnly);
  };
  sortNodes(roots);
  for (const root of roots) visit(root, 0, false, false);
  return roots;
}

function getFolderIdFromPath(pathname: string) {
  return pathname.match(/^\/folders\/([^/]+)/)?.[1] ?? null;
}

function getAncestorIds(folderId: string | null, folders: Folder[]) {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ids: string[] = [];
  let current = byId.get(folderId);
  const seen = new Set<string>();

  while (current?.parentFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    ids.push(current.parentFolderId);
    current = byId.get(current.parentFolderId);
  }

  return ids;
}

export function FolderSidebar({
  userEmail,
  onNavigate,
  onCollapse,
}: {
  userEmail?: string | null;
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["folders"],
    queryFn: api.folders,
  });
  const nav = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentFolderId = getFolderIdFromPath(pathname);
  const folders = data?.folders ?? [];
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ancestorIds = getAncestorIds(currentFolderId, folders);
    if (!ancestorIds.length) return;
    setExpandedFolderIds((current) => new Set([...current, ...ancestorIds]));
  }, [currentFolderId, folders]);

  const toggleExpanded = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderFolderRows = (nodes: FolderNode[]): ReactNode[] => nodes.flatMap((folder) => {
    const hasChildren = folder.children.length > 0;
    const expanded = expandedFolderIds.has(folder.id);
    const row = <div
      key={folder.id}
      className="flex items-center gap-1 rounded-md hover:bg-[var(--notes-hover)]"
      style={{ paddingLeft: `${folder.depth * 0.75}rem` }}
    >
      {hasChildren ? <button
        type="button"
        className="rounded-md p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
        aria-label={expanded ? `Collapse ${folder.title}` : `Expand ${folder.title}`}
        onClick={() => toggleExpanded(folder.id)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button> : <span className="w-5 shrink-0" />}
      <Link
        to="/folders/$folderId"
        params={{ folderId: folder.id }}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm"
        onClick={onNavigate}
      >
        <span className="truncate">{folder.title}</span>
        {folder.effectivePrivate ? <Lock className="h-3 w-3 shrink-0 text-[var(--notes-muted)]" aria-label="Private folder" /> : null}
        {!folder.effectivePrivate && folder.effectiveAgentReadOnly ? <span className="shrink-0 rounded border border-amber-500/50 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-600" aria-label="Read-only for agents">RO</span> : null}
      </Link>
      <FolderActionsPopover folder={folder} depth={folder.depth} />
    </div>;
    return expanded ? [row, ...renderFolderRows(folder.children)] : [row];
  });

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-4 md:h-screen md:w-72">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="font-semibold">MinuNotes</h1>
        {onCollapse ? (
          <button className="rounded-md border border-[var(--notes-border)] p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" type="button" aria-label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchDialog />
        <CreateFolderDialog />
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && (
        <p className="text-xs text-red-600">
          API unavailable. Check VITE_API_URL.
        </p>
      )}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
        <Link
          to="/templates"
          className="block rounded-md px-3 py-2 text-sm text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
          onClick={onNavigate}
        >
          Templates
        </Link>
        {renderFolderRows(folderTree)}
      </nav>
      <div className="shrink-0 border-t border-[var(--notes-border)] pt-4 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm">{userEmail}</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <ActionMenuIconButton
                icon="settings"
                aria-label="Open settings"
              />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <ThemeSelect />
              <ActionMenuButton
                onClick={() => {
                  nav({ to: "/resources" });
                  onNavigate?.();
                }}
              >
                Resources
              </ActionMenuButton>
              <ActionMenuButton
                onClick={() => {
                  nav({ to: "/settings/api-access" });
                  onNavigate?.();
                }}
              >
                API Access
              </ActionMenuButton>
              <ActionMenuButton onClick={() => authClient.signOut()}>
                Logout
              </ActionMenuButton>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </aside>
  );
}
