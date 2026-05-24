import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { CreateFolderDialog } from "./create-folder-dialog";
import { FolderActionsPopover } from "./folder-actions-popover";
import { SearchDialog } from "./search-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function FolderSidebar({ userEmail }: { userEmail?: string | null }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["folders"], queryFn: api.folders });

  return <aside className="flex h-screen w-72 flex-col border-r border-slate-200 p-4 dark:border-slate-800">
    <div className="mb-4 flex items-center justify-between gap-2"><h1 className="font-semibold">Notes</h1><CreateFolderDialog /></div>
    <div className="mb-4 flex gap-2"><SearchDialog /></div>
    {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
    {error && <p className="text-xs text-red-600">API unavailable. Check VITE_API_URL.</p>}
    <nav className="space-y-1">
      {(data?.folders ?? []).map((folder) => <div key={folder.id} className="flex items-center gap-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-900"><Link to="/folders/$folderId" params={{ folderId: folder.id }} className="min-w-0 flex-1 px-3 py-2 text-sm">{folder.title}</Link><FolderActionsPopover folder={folder} /></div>)}
    </nav>
    <div className="mt-auto border-t border-slate-200 pt-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500">Signed in as</p>
          <p className="truncate text-sm">{userEmail}</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button className="rounded-md p-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Open settings"><Settings className="h-4 w-4" /></button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-40 p-1">
            <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => authClient.signOut()}>Logout</button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </aside>;
}
