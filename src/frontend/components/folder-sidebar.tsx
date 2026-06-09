import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PanelLeftClose } from "lucide-react";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { CreateFolderDialog } from "./create-folder-dialog";
import { FolderActionsPopover } from "./folder-actions-popover";
import { SearchDialog } from "./search-dialog";
import { ThemeSelect } from "./theme-select";
import { ActionMenuButton, ActionMenuIconButton } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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
        {(data?.folders ?? []).map((folder) => (
          <div
            key={folder.id}
            className="flex items-center gap-2 rounded-md hover:bg-[var(--notes-hover)]"
          >
            <Link
              to="/folders/$folderId"
              params={{ folderId: folder.id }}
              className="min-w-0 flex-1 px-3 py-2 text-sm"
              onClick={onNavigate}
            >
              {folder.title}
            </Link>
            <FolderActionsPopover folder={folder} />
          </div>
        ))}
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
