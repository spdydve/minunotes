import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type ApiKey, type Folder } from "../lib/api";
import { Button } from "./ui/button";

type PermissionValue = { canRead: boolean; canCreate: boolean; canEdit: boolean };

function FolderPermissionRow({ folder, value, onChange }: { folder: Folder; value: PermissionValue; onChange: (value: PermissionValue) => void }) {
  return <div className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
    <span className="truncate">{folder.title}</span>
    {(["canRead", "canCreate", "canEdit"] as const).map((key) => <label key={key} className="flex items-center gap-1 text-xs text-slate-500">
      <input type="checkbox" checked={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
      {key === "canRead" ? "Read" : key === "canCreate" ? "Create" : "Edit"}
    </label>)}
  </div>;
}

export function ApiKeyAccessDialog({ folders, apiKey, onSaved, trigger }: { folders: Folder[]; apiKey?: ApiKey; onSaved: () => void; trigger: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, PermissionValue>>({});
  const [saving, setSaving] = useState(false);
  const isEditing = !!apiKey;

  useEffect(() => {
    if (!open) return;
    setName(apiKey?.name ?? "");
    setCreatedKey(null);
    setCopied(false);
    setPermissions(Object.fromEntries((apiKey?.permissions ?? []).map((permission) => [permission.folderId, { canRead: permission.canRead, canCreate: permission.canCreate, canEdit: permission.canEdit }])));
  }, [apiKey, open]);

  const close = () => setOpen(false);
  const setAll = (value: PermissionValue) => setPermissions(Object.fromEntries(folders.map((folder) => [folder.id, value])));
  const selectedPermissions = () => Object.entries(permissions)
    .filter(([, permission]) => permission.canRead || permission.canCreate || permission.canEdit)
    .map(([folderId, permission]) => ({ folderId, ...permission }));

  const submit = async () => {
    setSaving(true);
    try {
      if (apiKey) await api.updateApiKey(apiKey.id, { name, permissions: selectedPermissions() });
      else {
        const result = await api.createApiKey({ name, permissions: selectedPermissions() });
        setCreatedKey(result.key);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <>
    {trigger(() => setOpen(true))}
    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{isEditing ? "Edit API key" : "Create API key"}</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the folders and actions this key can access.</p>
          </div>
          <Button onClick={close}>Close</Button>
        </div>

        {createdKey ? <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-200">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2 rounded bg-white p-2 dark:bg-slate-900">
            <code className="min-w-0 flex-1 overflow-x-auto text-xs">{createdKey}</code>
            <button className={`rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${copied ? "text-emerald-600" : "text-slate-500"}`} onClick={copyKey} aria-label="Copy API key">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div> : <>
          <input className="mt-4 w-full rounded-md border bg-transparent px-3 py-2 text-sm dark:border-slate-800" placeholder="Key name, e.g. Workout Script" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setAll({ canRead: true, canCreate: true, canEdit: true })}>Grant all</Button>
            <Button onClick={() => setAll({ canRead: false, canCreate: false, canEdit: false })}>Clear all</Button>
          </div>
          <div className="mt-3 space-y-2">
            {folders.map((folder) => <FolderPermissionRow key={folder.id} folder={folder} value={permissions[folder.id] ?? { canRead: false, canCreate: false, canEdit: false }} onChange={(value) => setPermissions((current) => ({ ...current, [folder.id]: value }))} />)}
          </div>
          <div className="mt-4 flex justify-end"><Button disabled={!name.trim() || saving} onClick={submit}>{isEditing ? "Save changes" : "Create key"}</Button></div>
        </>}
      </div>
    </div> : null}
  </>;
}
