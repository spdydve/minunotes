import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api, type Folder, type TrashedFolder, type TrashedFolderContents, type TrashedNote } from '../lib/api';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { EmptyState } from './ui/empty-state';

function deletedAtLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function noteKind(note: Pick<TrashedNote, 'type' | 'documentType'>) {
  if (note.type === 'template') return 'Template';
  if (note.documentType.startsWith('canvas.')) return 'Canvas';
  return 'Note';
}

function noteLocation(note: TrashedNote) {
  if (note.originalFolderAvailable && note.originalFolderTitle) return note.originalFolderTitle;
  return 'Original folder unavailable';
}

function folderLocation(folder: TrashedFolder) {
  if (!folder.parentFolderId) return 'Top level';
  if (folder.originalParentAvailable && folder.originalParentTitle) return folder.originalParentTitle;
  return 'Original parent unavailable';
}

function FolderContentsTree({ contents }: { contents: TrashedFolderContents }) {
  const childFolders = new Map<string, TrashedFolderContents['folders']>();
  const folderNotes = new Map<string, TrashedFolderContents['notes']>();

  for (const folder of contents.folders) {
    if (folder.id === contents.rootFolderId || !folder.parentFolderId) continue;
    const siblings = childFolders.get(folder.parentFolderId) ?? [];
    siblings.push(folder);
    childFolders.set(folder.parentFolderId, siblings);
  }
  for (const note of contents.notes) {
    const siblings = folderNotes.get(note.folderId) ?? [];
    siblings.push(note);
    folderNotes.set(note.folderId, siblings);
  }

  const renderChildren = (folderId: string, ancestors: Set<string>) => {
    const directNotes = folderNotes.get(folderId) ?? [];
    const directFolders = childFolders.get(folderId) ?? [];
    if (directNotes.length === 0 && directFolders.length === 0) return null;

    return (
      <ul className="ml-3 space-y-1 border-[var(--notes-border)] border-l pl-3">
        {directFolders.map((folder) => {
          const cyclic = ancestors.has(folder.id);
          return (
            <li key={folder.id}>
              <div className="flex min-w-0 items-center gap-2 py-1 text-sm">
                <span className="truncate font-medium">{folder.title}</span>
                <span className="notes-muted text-xs">Folder</span>
              </div>
              {cyclic ? null : renderChildren(folder.id, new Set([...ancestors, folder.id]))}
            </li>
          );
        })}
        {directNotes.map((note) => (
          <li key={note.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
            <span className="truncate">{note.title}</span>
            <span className="notes-muted text-xs">{noteKind(note)}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    renderChildren(contents.rootFolderId, new Set([contents.rootFolderId])) ?? (
      <p className="notes-muted text-sm">This folder batch has no child items.</p>
    )
  );
}

type RestoreTarget = { note: TrashedNote; folderId: string };
type RestoreInput = { kind: 'note'; item: TrashedNote; folderId?: string } | { kind: 'folder'; item: TrashedFolder };
type PurgeInput = { kind: 'note'; item: TrashedNote } | { kind: 'folder'; item: TrashedFolder };

export function TrashTable({
  notes,
  folders,
  activeFolders,
}: {
  notes: TrashedNote[];
  folders: TrashedFolder[];
  activeFolders: Folder[];
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [contentsFolderId, setContentsFolderId] = useState<string | null>(null);
  const folderContents = useQuery({
    queryKey: ['trash', 'folders', contentsFolderId, 'contents'],
    queryFn: () => api.trashedFolderContents(contentsFolderId as string),
    enabled: Boolean(contentsFolderId),
    retry: false,
  });

  const refreshActiveContent = () => {
    qc.invalidateQueries({ queryKey: ['trash'] });
    qc.invalidateQueries({ queryKey: ['folders'] });
    qc.invalidateQueries({ queryKey: ['notes'] });
    qc.invalidateQueries({ queryKey: ['templates'] });
    qc.invalidateQueries({ queryKey: ['folder-templates'] });
  };

  const restore = useMutation({
    mutationFn: async (input: RestoreInput) => {
      if (input.kind === 'note') await api.restoreTrashedNote(input.item.id, input.folderId);
      else await api.restoreTrashedFolder(input.item.id);
    },
    onSuccess: (_result, input) => {
      refreshActiveContent();
      if (input.kind === 'folder' && contentsFolderId === input.item.id) setContentsFolderId(null);
      if (input.kind === 'note') {
        setRestoreTarget(null);
        qc.removeQueries({ queryKey: ['note', input.item.id] });
        nav({ to: '/notes/$noteId', params: { noteId: input.item.id } });
      } else {
        nav({ to: '/folders/$folderId', params: { folderId: input.item.id } });
      }
    },
  });

  const purge = useMutation({
    mutationFn: (input: PurgeInput) =>
      input.kind === 'note'
        ? api.permanentlyDeleteTrashedNote(input.item.id)
        : api.permanentlyDeleteTrashedFolder(input.item.id),
    onSuccess: (_result, input) => {
      refreshActiveContent();
      if (input.kind === 'folder' && contentsFolderId === input.item.id) setContentsFolderId(null);
      if (input.kind === 'note') qc.removeQueries({ queryKey: ['note', input.item.id] });
    },
  });

  const requestNoteRestore = (note: TrashedNote) => {
    restore.reset();
    if (note.originalFolderAvailable) restore.mutate({ kind: 'note', item: note });
    else setRestoreTarget({ note, folderId: activeFolders[0]?.id ?? '' });
  };

  const restoreError = restore.error instanceof Error ? restore.error.message : null;

  if (notes.length === 0 && folders.length === 0)
    return (
      <EmptyState title="Trash is empty">
        <p>Notes, templates, and folders moved to Trash will appear here.</p>
      </EmptyState>
    );

  return (
    <div className="space-y-8">
      {restoreError && !restoreTarget ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-600 text-sm" role="alert">
          {restoreError}
        </p>
      ) : null}

      <section aria-labelledby="trashed-folders-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 id="trashed-folders-heading" className="font-semibold text-lg">
              Folders
            </h3>
            <p className="notes-muted text-sm">Folder roots include the subfolders and notes moved with them.</p>
          </div>
          <span className="notes-muted text-sm">{folders.length}</span>
        </div>
        {folders.length > 0 ? (
          <ul className="divide-y divide-[var(--notes-border)] rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
            {folders.map((folder) => {
              const restoring =
                restore.isPending && restore.variables?.kind === 'folder' && restore.variables.item.id === folder.id;
              return (
                <li key={folder.id} className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{folder.title}</p>
                      <p className="notes-muted mt-1 text-sm">
                        From {folderLocation(folder)} · Deleted {deletedAtLabel(folder.deletedAt)}
                      </p>
                      <p className="notes-muted mt-1 text-xs">
                        {folder.descendantFolderCount} {folder.descendantFolderCount === 1 ? 'subfolder' : 'subfolders'}{' '}
                        · {folder.noteCount} {folder.noteCount === 1 ? 'note' : 'notes'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        aria-expanded={contentsFolderId === folder.id}
                        aria-controls={`trash-folder-contents-${folder.id}`}
                        onClick={() => setContentsFolderId((current) => (current === folder.id ? null : folder.id))}
                      >
                        {contentsFolderId === folder.id ? 'Hide contents' : 'View contents'}
                      </Button>
                      <Button
                        aria-label={`Restore ${folder.title}`}
                        disabled={restore.isPending || purge.isPending}
                        onClick={() => {
                          restore.reset();
                          restore.mutate({ kind: 'folder', item: folder });
                        }}
                      >
                        {restoring ? 'Restoring…' : 'Restore'}
                      </Button>
                      <DeleteConfirmDialog
                        label={folder.title}
                        heading={`Permanently delete ${folder.title}?`}
                        warning={`This permanently deletes this folder batch, including ${folder.descendantFolderCount} subfolders and ${folder.noteCount} notes. This cannot be undone.`}
                        actionLabel="Permanently delete"
                        onConfirm={() => purge.mutateAsync({ kind: 'folder', item: folder })}
                        trigger={
                          <span className="block rounded-md border border-[var(--notes-button-destructive-border)] bg-[var(--notes-button-destructive-bg)] px-3 py-2 text-[var(--notes-button-destructive-text)] text-sm transition-colors hover:bg-[var(--notes-button-destructive-hover)]">
                            Permanently delete
                          </span>
                        }
                      />
                    </div>
                  </div>
                  {contentsFolderId === folder.id ? (
                    <div
                      id={`trash-folder-contents-${folder.id}`}
                      className="mt-4 rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-3"
                    >
                      <p className="mb-2 font-medium text-sm">Contents of {folder.title}</p>
                      {folderContents.isLoading ? <p className="notes-muted text-sm">Loading contents…</p> : null}
                      {folderContents.error ? (
                        <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
                          <p className="text-red-600 text-sm">Unable to load folder contents.</p>
                          <Button onClick={() => void folderContents.refetch()}>Try again</Button>
                        </div>
                      ) : null}
                      {folderContents.data ? <FolderContentsTree contents={folderContents.data} /> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notes-muted rounded-lg border border-[var(--notes-border)] border-dashed p-4 text-sm">
            No folders in Trash.
          </p>
        )}
      </section>

      <section aria-labelledby="trashed-notes-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 id="trashed-notes-heading" className="font-semibold text-lg">
              Notes and templates
            </h3>
            <p className="notes-muted text-sm">Restore an item to its original folder or choose a new destination.</p>
          </div>
          <span className="notes-muted text-sm">{notes.length}</span>
        </div>
        {notes.length > 0 ? (
          <ul className="divide-y divide-[var(--notes-border)] rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
            {notes.map((note) => {
              const restoring =
                restore.isPending && restore.variables?.kind === 'note' && restore.variables.item.id === note.id;
              return (
                <li key={note.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-medium">{note.title}</p>
                      <span className="shrink-0 rounded border border-[var(--notes-border)] px-1.5 py-0.5 text-[var(--notes-muted)] text-xs">
                        {noteKind(note)}
                      </span>
                    </div>
                    <p className="notes-muted mt-1 text-sm">
                      From {noteLocation(note)} · Deleted {deletedAtLabel(note.deletedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      aria-label={`Restore ${note.title}`}
                      disabled={restore.isPending || purge.isPending}
                      onClick={() => requestNoteRestore(note)}
                    >
                      {restoring ? 'Restoring…' : 'Restore'}
                    </Button>
                    <DeleteConfirmDialog
                      label={note.title}
                      heading={`Permanently delete ${note.title}?`}
                      warning={`This permanently deletes this ${noteKind(note).toLowerCase()} and its attachments. This cannot be undone.`}
                      actionLabel="Permanently delete"
                      onConfirm={() => purge.mutateAsync({ kind: 'note', item: note })}
                      trigger={
                        <span className="block rounded-md border border-[var(--notes-button-destructive-border)] bg-[var(--notes-button-destructive-bg)] px-3 py-2 text-[var(--notes-button-destructive-text)] text-sm transition-colors hover:bg-[var(--notes-button-destructive-hover)]">
                          Permanently delete
                        </span>
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notes-muted rounded-lg border border-[var(--notes-border)] border-dashed p-4 text-sm">
            No notes or templates in Trash.
          </p>
        )}
      </section>

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open && !restore.isPending) {
            setRestoreTarget(null);
            restore.reset();
          }
        }}
      >
        <DialogContent className="left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg p-5">
          <DialogTitle className="font-semibold text-lg">Choose a restore destination</DialogTitle>
          <DialogDescription className="notes-muted mt-2 text-sm">
            The original folder for {restoreTarget?.note.title} is unavailable. Choose an active folder instead.
          </DialogDescription>
          {activeFolders.length > 0 ? (
            <label className="mt-4 block text-sm">
              Destination folder
              <select
                className="notes-input mt-2 w-full rounded-md px-3 py-2"
                value={restoreTarget?.folderId ?? ''}
                disabled={restore.isPending}
                onChange={(event) => {
                  if (restoreTarget) setRestoreTarget({ ...restoreTarget, folderId: event.target.value });
                }}
              >
                {activeFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-4 text-amber-600 text-sm">Create an active folder before restoring this item.</p>
          )}
          {restoreError ? (
            <p className="mt-3 text-red-500 text-sm" role="alert">
              {restoreError}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button disabled={restore.isPending} onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!restoreTarget?.folderId || restore.isPending}
              onClick={() => {
                if (restoreTarget)
                  restore.mutate({ kind: 'note', item: restoreTarget.note, folderId: restoreTarget.folderId });
              }}
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
