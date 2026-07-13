import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import type { Folder } from '../lib/api';
import { api } from '../lib/api';
import { CreateFolderDialog } from './create-folder-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { FolderShareDialog } from './folder-share-dialog';
import { MoveFolderDialog } from './move-folder-dialog';
import { RenameFolderDialog } from './rename-folder-dialog';
import { ActionMenuButton, ActionMenuIconButton } from './ui/action-menu';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function FolderActionsPopover({
  folder,
  depth = 0,
  icon = 'more',
}: {
  folder: Folder;
  depth?: number;
  icon?: 'more' | 'settings';
}) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteFolder(folder.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      nav({ to: '/' });
    },
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ActionMenuIconButton icon={icon} aria-label={`Actions for ${folder.title}`} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          {depth < 4 && !folder.isPrivate ? (
            <ActionMenuButton
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
            >
              <span className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4" />
                Add subfolder
              </span>
            </ActionMenuButton>
          ) : null}
          <ActionMenuButton
            onClick={() => {
              setOpen(false);
              nav({
                to: '/folders/$folderId/settings',
                params: { folderId: folder.id },
              });
            }}
          >
            Settings
          </ActionMenuButton>
          <ActionMenuButton
            onClick={() => {
              setOpen(false);
              setShareOpen(true);
            }}
          >
            Share
          </ActionMenuButton>
          <ActionMenuButton
            onClick={() => {
              setOpen(false);
              setRenameOpen(true);
            }}
          >
            Rename
          </ActionMenuButton>
          <ActionMenuButton
            onClick={() => {
              setOpen(false);
              setMoveOpen(true);
            }}
          >
            Move
          </ActionMenuButton>
          <ActionMenuButton
            onClick={() => {
              setOpen(false);
              nav({
                to: '/folders/$folderId/settings',
                params: { folderId: folder.id },
              });
            }}
          >
            Template settings
          </ActionMenuButton>
          <DeleteConfirmDialog
            label="folder"
            warning="All notes in this folder will be permanently lost."
            onConfirm={() => remove.mutate()}
            trigger={
              <span className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--notes-button-destructive-text)] transition-colors hover:bg-[var(--notes-button-destructive-soft-hover)]">
                Delete
              </span>
            }
          />
        </PopoverContent>
      </Popover>
      <CreateFolderDialog parentFolder={folder} open={createOpen} onOpenChange={setCreateOpen} />
      <MoveFolderDialog folder={folder} open={moveOpen} onOpenChange={setMoveOpen} />
      <FolderShareDialog folder={folder} open={shareOpen} onOpenChange={setShareOpen} />
      <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
    </>
  );
}
