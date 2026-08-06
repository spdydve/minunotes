import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Note } from '../lib/api';
import { DeleteConfirmDialog } from './delete-confirm-dialog';

export function TrashNotesDialog({
  notes,
  queryKey,
  onTrashed,
}: {
  notes: Note[];
  queryKey?: unknown[];
  onTrashed?: () => void;
}) {
  const qc = useQueryClient();
  const trash = useMutation({
    mutationFn: () => api.trashNotes(notes.map((note) => note.id)),
    onSuccess: () => {
      if (queryKey) qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['notes', 'recent'] });
      qc.invalidateQueries({ queryKey: ['trash'] });

      for (const note of notes) {
        qc.invalidateQueries({ queryKey: ['notes', note.folderId] });
        qc.removeQueries({ queryKey: ['note', note.id] });
      }
      if (notes.some((note) => note.type === 'template')) qc.invalidateQueries({ queryKey: ['templates'] });
      onTrashed?.();
    },
  });

  const count = notes.length;
  return (
    <DeleteConfirmDialog
      label={`${count} ${count === 1 ? 'item' : 'items'}`}
      heading={`Move ${count} ${count === 1 ? 'item' : 'items'} to Trash?`}
      warning="You can restore these items later from Trash. Public share links will be revoked."
      actionLabel="Move to Trash"
      triggerLabel="Trash"
      requiresTypedConfirmation={false}
      onConfirm={() => trash.mutateAsync()}
    />
  );
}
