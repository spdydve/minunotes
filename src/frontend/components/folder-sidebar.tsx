import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CreateFolderDialog } from "./create-folder-dialog";

export function FolderSidebar() {
  const { data, isLoading, error } = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  return <aside className="w-72 border-r border-slate-200 p-4 dark:border-slate-800">
    <div className="mb-4 flex items-center justify-between gap-2"><h1 className="font-semibold">Notes</h1><CreateFolderDialog /></div>
    {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
    {error && <p className="text-xs text-red-600">API unavailable. Check VITE_API_URL.</p>}
    <nav className="space-y-1">
      {(data?.folders ?? []).map((folder) => <Link key={folder.id} to="/folders/$folderId" params={{ folderId: folder.id }} className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-900">{folder.title}</Link>)}
    </nav>
  </aside>;
}
