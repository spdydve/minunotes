import { Link } from '@tanstack/react-router';
import { ArrowLeftToLine, Link2, X } from 'lucide-react';
import { useState } from 'react';
import type { Backlink } from '../lib/api';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

function backlinkTitle(backlink: Backlink) {
  return `Linked as [[${backlink.targetTitle}${backlink.label ? `|${backlink.label}` : ''}]]`;
}

export function BacklinksPanel({ backlinks, isLoading }: { backlinks?: Backlink[]; isLoading?: boolean }) {
  const [open, setOpen] = useState(false);
  const count = backlinks?.length ?? 0;

  if (isLoading || !backlinks || count === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] px-3 py-1.5 text-xs font-medium text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
          aria-label={`Open backlinks, ${count} ${count === 1 ? 'note' : 'notes'}`}
        >
          <Link2 className="h-3.5 w-3.5" />
          Backlinks{' '}
          <span className="rounded-full bg-[var(--notes-bg)] px-1.5 py-0.5 text-[0.65rem] text-[var(--notes-text)]">
            {count}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-2xl md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:border-y-0 md:border-r-0">
        <div className="flex items-start justify-between gap-3 border-[var(--notes-border)] border-b px-4 py-4">
          <div>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <ArrowLeftToLine className="h-4 w-4 text-[var(--notes-muted)]" />
              Backlinks
            </DialogTitle>
            <DialogDescription className="notes-muted mt-1 text-xs">
              {count} note{count === 1 ? '' : 's'} link{count === 1 ? 's' : ''} here
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
              aria-label="Close backlinks"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
        </div>

        <div className="max-h-[calc(82dvh-4.5rem)] overflow-y-auto p-3 md:max-h-[calc(100dvh-4.5rem)]">
          <div className="space-y-2">
            {backlinks.map((backlink) => (
              <Link
                key={backlink.id}
                to="/notes/$noteId"
                params={{ noteId: backlink.sourceNoteId }}
                className="block rounded-xl border border-[var(--notes-border)] bg-[var(--notes-bg)] p-3 hover:bg-[var(--notes-hover)]"
                title={backlinkTitle(backlink)}
                onClick={() => setOpen(false)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{backlink.sourceTitle}</p>
                    <p className="notes-muted mt-1 truncate text-xs">{backlinkTitle(backlink)}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--notes-border)] px-2 py-0.5 text-[0.65rem] text-[var(--notes-muted)] uppercase tracking-wide">
                    {backlink.linkType === 'wikilink' ? 'Wiki' : 'URL'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
