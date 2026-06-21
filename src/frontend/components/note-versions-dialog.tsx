import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Note, type NoteResponse, type NoteVersionSummary } from "../lib/api";
import { Button } from "./ui/button";

function reasonLabel(reason: NoteVersionSummary["reason"]) {
  if (reason === "create") return "Created";
  if (reason === "autosave_checkpoint") return "Checkpoint";
  if (reason === "before_agent_edit") return "Before API edit";
  if (reason === "before_restore") return "Before restore";
  return "Manual";
}

function actorLabel(version: NoteVersionSummary) {
  if (version.actorType === "agent") return "API key";
  if (version.actorType === "system") return "System";
  return "User";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function NoteVersionsDialog({ note, open, onOpenChange, onNoteUpdated }: { note: Note; open: boolean; onOpenChange: (open: boolean) => void; onNoteUpdated?: (response: NoteResponse) => void }) {
  const qc = useQueryClient();
  const versionsQuery = useQuery({ queryKey: ["note-versions", note.id], queryFn: () => api.noteVersions(note.id), enabled: open });
  const versions = versionsQuery.data?.versions ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSummary = useMemo(() => versions.find((version) => version.id === selectedId) ?? versions[0] ?? null, [selectedId, versions]);
  const selectedVersion = useQuery({ queryKey: ["note-version", note.id, selectedSummary?.id], queryFn: () => api.noteVersion(note.id, selectedSummary!.id), enabled: open && Boolean(selectedSummary) });

  useEffect(() => {
    if (!open) return;
    setSelectedId((current) => current ?? versions[0]?.id ?? null);
  }, [open, versions]);

  const restore = useMutation({
    mutationFn: async (versionId: string) => {
      if (!window.confirm("Restore this version? The current note state will be saved first.")) throw new Error("Restore cancelled");
      return api.restoreNoteVersion(note.id, versionId);
    },
    onSuccess: ({ note: restoredNote, contentHash }) => {
      onNoteUpdated?.({ note: restoredNote, contentHash });
      qc.invalidateQueries({ queryKey: ["note-versions", note.id] });
      qc.invalidateQueries({ queryKey: ["note-version", note.id] });
      qc.invalidateQueries({ queryKey: ["note-events", note.id] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "Restore cancelled") return;
    },
  });

  if (!open) return null;

  return createPortal(<div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--notes-border)] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Version history</h2>
          <p className="notes-muted mt-1 text-xs">Review snapshots and restore a previous state.</p>
        </div>
        <button type="button" className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]" onClick={() => onOpenChange(false)} aria-label="Close version history">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[18rem_1fr]">
        <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-[var(--notes-border)]">
          {versionsQuery.isLoading ? <p className="notes-muted p-3 text-sm">Loading versions...</p> : null}
          {!versionsQuery.isLoading && versions.length === 0 ? <p className="notes-muted p-3 text-sm">No versions yet.</p> : null}
          {versions.map((version) => (
            <button key={version.id} type="button" className={`block w-full border-b border-[var(--notes-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--notes-hover)] ${selectedSummary?.id === version.id ? "bg-[var(--notes-hover)]" : ""}`} onClick={() => setSelectedId(version.id)}>
              <span className="block font-medium text-[var(--notes-text)]">{reasonLabel(version.reason)}</span>
              <span className="notes-muted mt-0.5 block text-xs">{formatDate(version.createdAt)}</span>
              <span className="notes-muted mt-0.5 block text-xs">{actorLabel(version)}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)]">
          {selectedSummary ? (
            <div className="flex items-start justify-between gap-3 border-b border-[var(--notes-border)] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedVersion.data?.version.title ?? selectedSummary.title}</p>
                <p className="notes-muted mt-1 text-xs">{reasonLabel(selectedSummary.reason)} · {formatDate(selectedSummary.createdAt)} · {actorLabel(selectedSummary)}</p>
              </div>
              <Button className="px-2 py-1 text-xs" disabled={restore.isPending || selectedVersion.isLoading} onClick={() => selectedSummary && restore.mutate(selectedSummary.id)}>Restore</Button>
            </div>
          ) : null}

          <div className="max-h-[58vh] overflow-y-auto p-4">
            {selectedVersion.isLoading ? <p className="notes-muted text-sm">Loading version...</p> : null}
            {selectedVersion.data?.version ? <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[var(--notes-text)]">{selectedVersion.data.version.content || "(Empty note)"}</pre> : null}
          </div>
        </div>
      </div>
    </div>
  </div>, document.body);
}
