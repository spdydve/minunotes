import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button } from './ui/button';

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const nav = useNavigate();
  const trimmed = query.trim();
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.folders(), enabled: open });
  const { data, isFetching } = useQuery({
    queryKey: ['note-search', trimmed],
    queryFn: () => api.searchNotes(trimmed),
    enabled: open && trimmed.length > 0,
  });
  const folderMatches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return [];
    return (folders.data?.folders ?? []).filter((folder) => folder.title.toLowerCase().includes(q)).slice(0, 5);
  }, [folders.data?.folders, trimmed]);

  return (
    <>
      <Button className="inline-flex items-center gap-2" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        Search
      </Button>
      {open && (
        <div className="notes-overlay fixed inset-0 z-50 grid place-items-center p-4">
          <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Search notes</h2>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
            <input
              autoFocus
              className="notes-input mt-4 w-full rounded-md px-3 py-2"
              placeholder="Search notes or folders..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mt-4 max-h-[min(28rem,calc(100dvh-12rem))] space-y-4 overflow-auto">
              {folderMatches.length > 0 ? (
                <section>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Folders</p>
                  <div className="space-y-2">
                    {folderMatches.map((folder) => (
                      <button
                        key={folder.id}
                        className="block w-full rounded-md border border-[var(--notes-border)] p-3 text-left transition-colors hover:bg-[var(--notes-hover)]"
                        onClick={() => {
                          setOpen(false);
                          nav({ to: '/folders/$folderId', params: { folderId: folder.id } });
                        }}
                      >
                        <div className="font-medium">{folder.title}</div>
                        <div className="notes-muted text-xs">Folder</div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <section>
                {folderMatches.length > 0 ? (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Notes</p>
                ) : null}
                {isFetching && <p className="notes-muted text-sm">Searching...</p>}
                {!isFetching && trimmed && !data?.notes.length && !folderMatches.length && (
                  <p className="notes-muted text-sm">No notes or folders found.</p>
                )}
                {!isFetching && trimmed && !data?.notes.length && folderMatches.length > 0 && (
                  <p className="notes-muted text-sm">No matching notes found.</p>
                )}
                <div className="space-y-2">
                  {(data?.notes ?? []).map((note) => (
                    <Link
                      key={note.id}
                      to="/notes/$noteId"
                      params={{ noteId: note.id }}
                      onClick={() => setOpen(false)}
                      className="block rounded-md border border-[var(--notes-border)] p-3 transition-colors hover:bg-[var(--notes-hover)]"
                    >
                      <div className="font-medium">{note.title}</div>
                      <div className="notes-muted text-xs">{note.folderTitle}</div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
