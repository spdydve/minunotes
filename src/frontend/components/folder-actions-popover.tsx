import { useState } from "react";
import type { Folder } from "../lib/api";
import { FolderApiAccessDialog } from "./folder-api-access-dialog";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { ActionMenuButton, ActionMenuIconButton } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function FolderActionsPopover({ folder }: { folder: Folder }) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [apiAccessOpen, setApiAccessOpen] = useState(false);

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ActionMenuIconButton aria-label={`Actions for ${folder.title}`} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <ActionMenuButton onClick={() => { setOpen(false); setRenameOpen(true); }}>Rename</ActionMenuButton>
        <ActionMenuButton onClick={() => { setOpen(false); setApiAccessOpen(true); }}>API Access</ActionMenuButton>
      </PopoverContent>
    </Popover>
    <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
    <FolderApiAccessDialog folder={folder} open={apiAccessOpen} onOpenChange={setApiAccessOpen} />
  </>;
}
