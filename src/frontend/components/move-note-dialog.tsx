import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Note } from '../lib/api';
import { FolderDestinationPicker } from './folder-destination-picker';
import { Button } from './ui/button';

export function MoveNoteDialog({
  note,
  trigger,
  onOpenChange,
}: {
  note: Note;
  trigger?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['folders'], queryFn: api.folders, enabled: open });
  const mutation = useMutation({
    mutationFn: () => api.moveNote(note.id, folderId ?? note.folderId),
    onSuccess: ({ note: moved }) => {
      qc.invalidateQueries({ queryKey: ['notes', note.folderId] });
      qc.invalidateQueries({ queryKey: ['notes', moved.folderId] });
      qc.invalidateQueries({ queryKey: ['note', note.id] });
      setOpen(false);
      onOpenChange?.(false);
    },
  });
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };
  const openDialog = () => {
    setFolderId(note.folderId);
    setOpen(true);
    onOpenChange?.(true);
  };

  return (
    <>
      {trigger ? (
        <button type="button" className="block w-full text-left" onClick={openDialog}>
          {trigger}
        </button>
      ) : (
        <Button onClick={openDialog}>Move</Button>
      )}
      {open &&
        createPortal(
          <div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
            <div className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-semibold">Move note</h2>
              <p className="mt-1 text-sm text-[var(--notes-muted)]">Navigate to a folder, then choose Move here.</p>
              {!folderId ? (
                <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  Choose a folder destination.
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
                  disabled={mutation.isPending || !folderId || folderId === note.folderId}
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
