import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type MoveNotesResponse, type Note } from '../lib/api';
import { FolderDestinationPicker } from './folder-destination-picker';
import { Button } from './ui/button';

export function MoveNotesDialog({
  notes,
  trigger,
  onOpenChange,
  onMoved,
}: {
  notes: Note[];
  trigger?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  onMoved?: (response: MoveNotesResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(notes[0]?.folderId ?? null);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['folders'], queryFn: api.folders, enabled: open });
  const sourceFolderIds = useMemo(() => [...new Set(notes.map((note) => note.folderId))], [notes]);
  const title = notes.length === 1 ? 'Move note' : `Move ${notes.length} notes`;
  const allNotesAlreadyInDestination = Boolean(folderId) && notes.every((note) => note.folderId === folderId);

  const mutation = useMutation({
    mutationFn: () =>
      api.moveNotes(
        notes.map((note) => note.id),
        folderId ?? ''
      ),
    onSuccess: (response) => {
      for (const sourceFolderId of sourceFolderIds) qc.invalidateQueries({ queryKey: ['notes', sourceFolderId] });
      if (folderId) qc.invalidateQueries({ queryKey: ['notes', folderId] });
      for (const note of notes) qc.invalidateQueries({ queryKey: ['note', note.id] });
      onMoved?.(response);
      setOpen(false);
      onOpenChange?.(false);
    },
  });

  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  const openDialog = () => {
    setFolderId(notes[0]?.folderId ?? null);
    setOpen(true);
    onOpenChange?.(true);
  };

  return (
    <>
      {trigger ? (
        <button type="button" className="block w-full text-left" disabled={notes.length === 0} onClick={openDialog}>
          {trigger}
        </button>
      ) : (
        <Button disabled={notes.length === 0} onClick={openDialog}>
          Move
        </Button>
      )}
      {open &&
        createPortal(
          <div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
            <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
              <h2 className="font-semibold text-lg">{title}</h2>
              <p className="mt-1 text-[var(--notes-muted)] text-sm">Navigate to a folder, then choose Move here.</p>
              {!folderId ? (
                <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300">
                  Choose a folder destination.
                </p>
              ) : null}
              {mutation.error ? (
                <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 text-sm dark:text-red-300">
                  {mutation.error instanceof Error ? mutation.error.message : 'Unable to move notes'}
                </p>
              ) : null}
              <div className="mt-4">
                <FolderDestinationPicker
                  folders={data?.folders ?? []}
                  currentFolderId={folderId}
                  onCurrentFolderIdChange={setFolderId}
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={mutation.isPending || !folderId || allNotesAlreadyInDestination}
                  onClick={() => mutation.mutate()}
                >
                  Move here
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
