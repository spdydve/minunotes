import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, type Note } from "../lib/api";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { MoveNoteDialog } from "./move-note-dialog";
import { ActionMenuButton, ActionMenuIconButton, ActionMenuItemLabel } from "./ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function NoteActionsPopover({ note, onDelete, onToggleApiEditable, icon = "more" }: { note: Note; onDelete: () => void; onToggleApiEditable?: () => void; icon?: "more" | "settings" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const duplicate = useMutation({
    mutationFn: () => api.createNote(note.folderId, { title: `${note.title} copy`, content: note.content, type: note.type }),
    onSuccess: ({ note: duplicateNote }) => {
      qc.invalidateQueries({ queryKey: [duplicateNote.type === "template" ? "templates" : "notes", duplicateNote.folderId] });
      if (duplicateNote.type === "template") qc.invalidateQueries({ queryKey: ["templates"] });
      navigate({ to: "/notes/$noteId", params: { noteId: duplicateNote.id } });
    },
  });

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <ActionMenuIconButton icon={icon} aria-label="Open note actions" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-40 p-1">
      <MoveNoteDialog note={note} onOpenChange={setOpen} trigger={<ActionMenuItemLabel>Move note</ActionMenuItemLabel>} />
      <ActionMenuButton disabled={duplicate.isPending} onClick={() => { duplicate.mutate(); setOpen(false); }}>Duplicate</ActionMenuButton>
      <ActionMenuButton onClick={() => { navigate({ to: "/notes/$noteId/activity", params: { noteId: note.id } }); setOpen(false); }}>View activity</ActionMenuButton>
      {onToggleApiEditable ? <ActionMenuButton onClick={() => { onToggleApiEditable(); setOpen(false); }}>{note.isApiEditable ? "Disable API edits" : "Enable API edits"}</ActionMenuButton> : null}
      <DeleteConfirmDialog label="note" warning="This note will be permanently lost." onConfirm={onDelete} onOpenChange={setOpen} trigger={<ActionMenuItemLabel destructive>Delete note</ActionMenuItemLabel>} />
    </PopoverContent>
  </Popover>;
}
