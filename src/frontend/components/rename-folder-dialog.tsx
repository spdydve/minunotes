import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useState } from "react";
import { api, type Folder } from "../lib/api";
import { Button } from "./ui/button";

export function RenameFolderDialog({ folder, triggerClassName, onDone, onOpen, open, onOpenChange }: { folder: Folder; triggerClassName?: string; onDone?: () => void; onOpen?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: (title: string) => api.renameFolder(folder.id, title), onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }) });
  const form = useForm({ defaultValues: { title: folder.title }, onSubmit: async ({ value }) => { await mutation.mutateAsync(value.title); setOpen(false); onDone?.(); } });
  const close = () => { form.reset(); setOpen(false); };

  return <>
    {open === undefined && <Button className={triggerClassName} onClick={() => { form.reset(); setOpen(true); onOpen?.(); }}>Rename</Button>}
    {isOpen && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/40">
      <form className="w-full max-w-md rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
        <h2 className="text-lg font-semibold">Rename folder</h2>
        <form.Field name="title">{(field) => <input autoFocus className="mt-4 w-full rounded-md border bg-transparent px-3 py-2" placeholder="Folder title" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}</form.Field>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={close}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Save</Button></div>
      </form>
    </div>, document.body)}
  </>;
}
