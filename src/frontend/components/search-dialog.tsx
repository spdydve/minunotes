import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const { data, isFetching } = useQuery({ queryKey: ["note-search", trimmed], queryFn: () => api.searchNotes(trimmed), enabled: open && trimmed.length > 0 });

  return <>
    <Button onClick={() => setOpen(true)}>Search</Button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-xl rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Search notes</h2><Button onClick={() => setOpen(false)}>Close</Button></div>
        <input autoFocus className="mt-4 w-full rounded-md border bg-transparent px-3 py-2" placeholder="Search title or content..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-4 max-h-96 space-y-2 overflow-auto">
          {isFetching && <p className="text-sm text-slate-500">Searching...</p>}
          {!isFetching && trimmed && !data?.notes.length && <p className="text-sm text-slate-500">No notes found.</p>}
          {(data?.notes ?? []).map((note) => <Link key={note.id} to="/notes/$noteId" params={{ noteId: note.id }} onClick={() => setOpen(false)} className="block rounded-md border p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
            <div className="font-medium">{note.title}</div>
            <div className="text-xs text-slate-500">{note.folderTitle}</div>
          </Link>)}
        </div>
      </div>
    </div>}
  </>;
}
