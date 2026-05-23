import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Note } from "../lib/api";
import { Button } from "./ui/button";

export function MoveNoteDialog({ note }: { note: Note }) {
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
    },
  });

  return <>
    <Button onClick={() => { setFolderId(note.folderId); setOpen(true); }}>Move</Button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <form className="w-full max-w-md rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <h2 className="text-lg font-semibold">Move note</h2>
        <select className="mt-4 w-full rounded-md border bg-transparent px-3 py-2" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          {(data?.folders ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={mutation.isPending || folderId === note.folderId}>Move</Button></div>
      </form>
    </div>}
  </>;
}
