import { Link } from "@tanstack/react-router";
import { ArrowLeftToLine, Link2, X } from "lucide-react";
import { useState } from "react";
import type { Backlink } from "../lib/api";

function backlinkTitle(backlink: Backlink) {
  return `Linked as [[${backlink.targetTitle}${backlink.label ? `|${backlink.label}` : ""}]]`;
}

export function BacklinksPanel({ backlinks, isLoading }: { backlinks?: Backlink[]; isLoading?: boolean }) {
  const [open, setOpen] = useState(false);
  const count = backlinks?.length ?? 0;

  if (isLoading) {
    return <div className="mt-3 hidden items-center gap-2 rounded-full border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] px-3 py-1.5 text-xs text-[var(--notes-muted)] md:inline-flex">
      <Link2 className="h-3.5 w-3.5" />
      Loading backlinks...
    </div>;
  }

  if (!backlinks || count === 0) return null;

  return <>
    <button
      type="button"
      className="mt-3 hidden items-center gap-2 rounded-full border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] px-3 py-1.5 text-xs font-medium text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)] md:inline-flex"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Link2 className="h-3.5 w-3.5" />
      Backlinks <span className="rounded-full bg-[var(--notes-bg)] px-1.5 py-0.5 text-[0.65rem] text-[var(--notes-text)]">{count}</span>
    </button>

    {open ? (
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Backlinks">
        <button
          type="button"
          className="absolute inset-0 bg-black/30"
          aria-label="Close backlinks"
          onClick={() => setOpen(false)}
        />
        <aside className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-hidden rounded-t-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-96 md:rounded-none md:border-y-0 md:border-r-0">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--notes-border)] px-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ArrowLeftToLine className="h-4 w-4 text-[var(--notes-muted)]" />
                Backlinks
              </div>
              <p className="notes-muted mt-1 text-xs">{count} note{count === 1 ? "" : "s"} link{count === 1 ? "s" : ""} here</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
              onClick={() => setOpen(false)}
              aria-label="Close backlinks"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[calc(82vh-4.5rem)] overflow-y-auto p-3 md:max-h-[calc(100vh-4.5rem)]">
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
                    <span className="shrink-0 rounded-full border border-[var(--notes-border)] px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-[var(--notes-muted)]">
                      {backlink.linkType === "wikilink" ? "Wiki" : "URL"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    ) : null}
  </>;
}
