import { useState } from "react";
import type { Folder } from "../lib/api";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { ActionMenuButton, ActionMenuIconButton } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function FolderActionsPopover({ folder }: { folder: Folder }) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ActionMenuIconButton aria-label={`Actions for ${folder.title}`} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <ActionMenuButton onClick={() => { setOpen(false); setRenameOpen(true); }}>Rename</ActionMenuButton>
      </PopoverContent>
    </Popover>
    <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
  </>;
}
