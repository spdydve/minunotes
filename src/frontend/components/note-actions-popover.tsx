import { useState } from "react";
import type { Note } from "../lib/api";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { MoveNoteDialog } from "./move-note-dialog";
import { ActionMenuIconButton, ActionMenuItemLabel } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function NoteActionsPopover({ note, onDelete, icon = "more" }: { note: Note; onDelete: () => void; icon?: "more" | "settings" }) {
  const [open, setOpen] = useState(false);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <ActionMenuIconButton icon={icon} aria-label="Open note actions" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-40 p-1">
      <MoveNoteDialog note={note} onOpenChange={setOpen} trigger={<ActionMenuItemLabel>Move note</ActionMenuItemLabel>} />
      <DeleteConfirmDialog label="note" warning="This note will be permanently lost." onConfirm={onDelete} onOpenChange={setOpen} trigger={<ActionMenuItemLabel destructive>Delete note</ActionMenuItemLabel>} />
    </PopoverContent>
  </Popover>;
}
