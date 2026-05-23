import { useState } from "react";
import type { Folder } from "../lib/api";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function FolderActionsPopover({ folder }: { folder: Folder }) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button aria-label={`Actions for ${folder.title}`}>⋯</Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <Button className="w-full justify-start" onClick={() => { setOpen(false); setRenameOpen(true); }}>Rename</Button>
      </PopoverContent>
    </Popover>
    <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
  </>;
}
