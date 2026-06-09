import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";

export function CreateFolderDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: api.createFolder, onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }) });
  const form = useForm({ defaultValues: { title: "" }, onSubmit: async ({ value }) => { await mutation.mutateAsync(value.title); form.reset(); setOpen(false); } });
  const close = () => { form.reset(); setOpen(false); };
  return <>
    <Button className="inline-flex items-center gap-2" onClick={() => { form.reset(); setOpen(true); }}><Plus className="h-4 w-4" />New folder</Button>
    {open && <div className="notes-overlay fixed inset-0 z-50 grid place-items-center p-4">
      <form className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5" onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
        <h2 className="text-lg font-semibold">Create folder</h2>
        <form.Field name="title">{(field) => <input autoFocus className="notes-input mt-4 w-full rounded-md px-3 py-2" placeholder="Folder title" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}</form.Field>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={close}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Create</Button></div>
      </form>
    </div>}
  </>;
}
