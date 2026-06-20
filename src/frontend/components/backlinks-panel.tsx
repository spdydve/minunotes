import { Link } from "@tanstack/react-router";
import type { Backlink } from "../lib/api";

export function BacklinksPanel({ backlinks, isLoading }: { backlinks?: Backlink[]; isLoading?: boolean }) {
  if (isLoading) return <p className="notes-muted mt-3 text-xs">Loading backlinks...</p>;
  if (!backlinks || backlinks.length === 0) return null;

  return <div className="mt-4 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-3">
    <p className="notes-muted text-xs font-medium uppercase tracking-wide">Backlinks</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {backlinks.map((backlink) => (
        <Link
          key={backlink.id}
          to="/notes/$noteId"
          params={{ noteId: backlink.sourceNoteId }}
          className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] px-2 py-1 text-xs font-medium hover:bg-[var(--notes-hover)]"
          title={`Linked as [[${backlink.targetTitle}${backlink.label ? `|${backlink.label}` : ""}]]`}
        >
          {backlink.sourceTitle}
        </Link>
      ))}
    </div>
  </div>;
}
