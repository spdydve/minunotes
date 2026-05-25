import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useState, type ReactNode } from "react";
import { api, type Note } from "../lib/api";
import { Button } from "./ui/button";

export function MoveNoteDialog({ note, trigger, onOpenChange }: { note: Note; trigger?: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState(note.folderId);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const mutation = useMutation({
    mutationFn: () => api.moveNote(note.id, folderId),
    onSuccess: ({ note: moved }) => {
      qc.invalidateQueries({ queryKey: ["notes", note.folderId] });
      qc.invalidateQueries({ queryKey: ["notes", moved.folderId] });
      qc.invalidateQueries({ queryKey: ["note", note.id] });
      setOpen(false);
      onOpenChange?.(false);
    },
  });

  return <>
    {trigger ? <button type="button" onClick={() => { setFolderId(note.folderId); setOpen(true); onOpenChange?.(true); }}>{trigger}</button> : <Button onClick={() => { setFolderId(note.folderId); setOpen(true); onOpenChange?.(true); }}>Move</Button>}
    {open && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/40">
      <form className="w-full max-w-md rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <h2 className="text-lg font-semibold">Move note</h2>
        <select className="mt-4 w-full rounded-md border bg-transparent px-3 py-2" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          {(data?.folders ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={() => { setOpen(false); onOpenChange?.(false); }}>Cancel</Button><Button type="submit" disabled={mutation.isPending || folderId === note.folderId}>Move</Button></div>
      </form>
    </div>, document.body)}
  </>;
}
