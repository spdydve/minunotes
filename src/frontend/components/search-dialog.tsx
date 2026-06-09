import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const { data, isFetching } = useQuery({ queryKey: ["note-search", trimmed], queryFn: () => api.searchNotes(trimmed), enabled: open && trimmed.length > 0 });

  return <>
    <Button className="inline-flex items-center gap-2" onClick={() => setOpen(true)}><Search className="h-4 w-4" />Search</Button>
    {open && <div className="notes-overlay fixed inset-0 z-50 grid place-items-center p-4">
      <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Search notes</h2><Button onClick={() => setOpen(false)}>Close</Button></div>
        <input autoFocus className="notes-input mt-4 w-full rounded-md px-3 py-2" placeholder="Search title or content..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-4 max-h-[min(24rem,calc(100dvh-12rem))] space-y-2 overflow-auto">
          {isFetching && <p className="notes-muted text-sm">Searching...</p>}
          {!isFetching && trimmed && !data?.notes.length && <p className="notes-muted text-sm">No notes found.</p>}
          {(data?.notes ?? []).map((note) => <Link key={note.id} to="/notes/$noteId" params={{ noteId: note.id }} onClick={() => setOpen(false)} className="block rounded-md border border-[var(--notes-border)] p-3 transition-colors hover:bg-[var(--notes-hover)]">
            <div className="font-medium">{note.title}</div>
            <div className="notes-muted text-xs">{note.folderTitle}</div>
          </Link>)}
        </div>
      </div>
    </div>}
  </>;
}
