import { createPortal } from "react-dom";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";

export function DeleteConfirmDialog({ label, warning, onConfirm, trigger, onOpenChange }: { label: string; warning: string; onConfirm: () => void; trigger?: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return <>
    {trigger ? <button type="button" onClick={() => { setOpen(true); onOpenChange?.(true); }}>{trigger}</button> : <Button variant="destructive" onClick={() => { setOpen(true); onOpenChange?.(true); }}>Delete</Button>}
    {open && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold">Delete {label}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{warning}</p>
        <p className="mt-4 text-sm">Type <strong>delete</strong> to confirm.</p>
        <input className="mt-2 w-full rounded-md border bg-transparent px-3 py-2" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => { setOpen(false); onOpenChange?.(false); }}>Cancel</Button>
          <Button disabled={value !== "delete"} variant="destructive" onClick={() => { onConfirm(); setOpen(false); onOpenChange?.(false); }}>Delete</Button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
