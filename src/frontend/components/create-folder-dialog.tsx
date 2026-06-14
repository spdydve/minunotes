import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type Folder } from "../lib/api";
import { Button } from "./ui/button";

export function CreateFolderDialog({ parentFolder, triggerLabel = "New folder", trigger }: { parentFolder?: Folder; triggerLabel?: string; trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: (title: string) => api.createFolder(title, parentFolder?.id ?? null), onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }) });
  const form = useForm({ defaultValues: { title: "" }, onSubmit: async ({ value }) => { await mutation.mutateAsync(value.title); form.reset(); setOpen(false); } });
  const close = () => { form.reset(); setOpen(false); };
  return <>
    {trigger ? trigger(() => { form.reset(); setOpen(true); }) : <Button className="inline-flex items-center gap-2" onClick={() => { form.reset(); setOpen(true); }}><Plus className="h-4 w-4" />{triggerLabel}</Button>}
    {open ? createPortal(<div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
      <form className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5" onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
        <h2 className="text-lg font-semibold">{parentFolder ? "Create subfolder" : "Create folder"}</h2>
        {parentFolder ? <p className="mt-1 text-sm text-[var(--notes-muted)]">Under {parentFolder.title}</p> : null}
        <form.Field name="title">{(field) => <input autoFocus className="notes-input mt-4 w-full rounded-md px-3 py-2" placeholder="Folder title" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}</form.Field>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={close}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Create</Button></div>
      </form>
    </div>, document.body) : null}
  </>;
}
