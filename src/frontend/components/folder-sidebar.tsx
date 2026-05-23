import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { CreateFolderDialog } from "./create-folder-dialog";
import { FolderActionsPopover } from "./folder-actions-popover";
import { SearchDialog } from "./search-dialog";

export function FolderSidebar({ userEmail }: { userEmail?: string | null }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  return <aside className="w-72 border-r border-slate-200 p-4 dark:border-slate-800">
    <div className="mb-4 flex items-center justify-between gap-2"><h1 className="font-semibold">Notes</h1><CreateFolderDialog /></div>
    {userEmail && <p className="mb-3 truncate text-xs text-slate-500">{userEmail}</p>}
    <div className="mb-4 flex gap-2"><SearchDialog /><button className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900" onClick={() => authClient.signOut()}>Logout</button></div>
    {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
    {error && <p className="text-xs text-red-600">API unavailable. Check VITE_API_URL.</p>}
    <nav className="space-y-1">
      {(data?.folders ?? []).map((folder) => <div key={folder.id} className="flex items-center gap-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-900"><Link to="/folders/$folderId" params={{ folderId: folder.id }} className="min-w-0 flex-1 px-3 py-2 text-sm">{folder.title}</Link><FolderActionsPopover folder={folder} /></div>) }
    </nav>
  </aside>;
}
