import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

const OPEN_SEARCH_EVENT = 'minunotes:open-search';

export function openSearchDialog() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

export function searchShortcutLabel(platform = typeof navigator === 'undefined' ? '' : navigator.platform) {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘K' : 'Ctrl+K';
}

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'folder' | 'note';
};

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const nav = useNavigate();
  const trimmed = query.trim();
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders, enabled: open });
  const recent = useQuery({
    queryKey: ['notes', 'recent'],
    queryFn: () => api.recentNotes(6),
    enabled: open && !trimmed,
  });
  const search = useQuery({
    queryKey: ['note-search', trimmed],
    queryFn: () => api.searchNotes(trimmed),
    enabled: open && trimmed.length > 0,
  });

  const results = useMemo<SearchResult[]>(() => {
    if (!trimmed) {
      return (recent.data?.notes ?? []).slice(0, 6).map((note) => ({
        id: note.id,
        title: note.title,
        subtitle: folders.data?.folders.find((folder) => folder.id === note.folderId)?.title ?? 'Note',
        kind: 'note',
      }));
    }
    const normalized = trimmed.toLowerCase();
    const folderResults = (folders.data?.folders ?? [])
      .filter((folder) => folder.title.toLowerCase().includes(normalized))
      .slice(0, 5)
      .map((folder) => ({ id: folder.id, title: folder.title, subtitle: 'Folder', kind: 'folder' as const }));
    const noteResults = (search.data?.notes ?? []).map((note) => ({
      id: note.id,
      title: note.title,
      subtitle: note.folderTitle,
      kind: 'note' as const,
    }));
    return [...folderResults, ...noteResults];
  }, [folders.data?.folders, recent.data?.notes, search.data?.notes, trimmed]);

  useEffect(() => {
    const requestOpen = () => {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        requestOpen();
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, requestOpen);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, requestOpen);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    const activeResult = results[activeIndex];
    if (!open || !activeResult) return;
    document
      .getElementById(`search-result-${activeResult.kind}-${activeResult.id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, results]);

  const closeDialog = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const selectResult = (result: SearchResult | undefined) => {
    if (!result) return;
    closeDialog();
    if (result.kind === 'folder') nav({ to: '/folders/$folderId', params: { folderId: result.id } });
    else nav({ to: '/notes/$noteId', params: { noteId: result.id } });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  const isFetching = trimmed ? search.isFetching : recent.isFetching;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true);
        else closeDialog();
      }}
    >
      <DialogContent
        className="inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl p-4 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-5"
        aria-describedby="search-dialog-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          previousFocusRef.current?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-lg font-semibold">Search notes</DialogTitle>
            <DialogDescription id="search-dialog-description" className="notes-muted mt-1 text-xs">
              Search folders and notes, or open a recent note.
            </DialogDescription>
          </div>
          <Button type="button" aria-label="Close search" onClick={closeDialog}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--notes-muted)]" />
          <input
            ref={inputRef}
            className="notes-input w-full rounded-md py-2 pr-3 pl-10"
            placeholder="Search notes or folders..."
            aria-label="Search notes or folders"
            aria-controls="search-results"
            aria-activedescendant={
              results[activeIndex] ? `search-result-${results[activeIndex].kind}-${results[activeIndex].id}` : undefined
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>
        <div
          id="search-results"
          role="listbox"
          aria-label={trimmed ? 'Search results' : 'Recent notes'}
          className="mt-4 max-h-[min(28rem,60dvh)] space-y-2 overflow-y-auto"
        >
          <p className="notes-muted px-1 text-xs font-medium uppercase tracking-wide">
            {trimmed ? 'Results' : 'Recent notes'}
          </p>
          {isFetching ? (
            <p className="notes-muted p-3 text-sm">{trimmed ? 'Searching...' : 'Loading recent notes...'}</p>
          ) : null}
          {!isFetching && results.length === 0 ? (
            <p className="notes-muted p-3 text-sm">{trimmed ? 'No notes or folders found.' : 'No recent notes yet.'}</p>
          ) : null}
          {results.map((result, index) => (
            <button
              key={`${result.kind}-${result.id}`}
              id={`search-result-${result.kind}-${result.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`block w-full rounded-md border p-3 text-left transition-colors ${index === activeIndex ? 'border-[var(--notes-text)] bg-[var(--notes-hover)]' : 'border-[var(--notes-border)] hover:bg-[var(--notes-hover)]'}`}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => selectResult(result)}
            >
              <span className="block font-medium">{result.title}</span>
              <span className="notes-muted block text-xs">{result.subtitle}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
