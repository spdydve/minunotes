import { MoreHorizontal } from "lucide-react";
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
        <Button className="border-0 px-2 shadow-none hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={`Actions for ${folder.title}`}><MoreHorizontal className="h-4 w-4" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <Button className="w-full justify-start" onClick={() => { setOpen(false); setRenameOpen(true); }}>Rename</Button>
      </PopoverContent>
    </Popover>
    <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
  </>;
}
