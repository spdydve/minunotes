import { Check, Copy, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type ApiKey, type Folder } from "../lib/api";
import { Button } from "./ui/button";

type PermissionValue = { canRead: boolean; canCreate: boolean; canEdit: boolean };

function FolderPermissionRow({ folder, value, onChange, onRemove }: { folder: Folder; value: PermissionValue; onChange: (value: PermissionValue) => void; onRemove: () => void }) {
  return <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 sm:grid-cols-[1fr_repeat(3,auto)_auto] sm:items-center">
    <span className="truncate">{folder.title}</span>
    {(["canRead", "canCreate", "canEdit"] as const).map((key) => <label key={key} className="flex items-center gap-1 text-xs text-slate-500">
      <input type="checkbox" checked={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
      {key === "canRead" ? "Read" : key === "canCreate" ? "Create" : "Edit"}
    </label>)}
    <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-900" onClick={onRemove} aria-label={`Remove ${folder.title}`}>
      <X className="h-4 w-4" />
    </button>
  </div>;
}

export function ApiKeyAccessDialog({ folders, apiKey, onSaved, trigger }: { folders: Folder[]; apiKey?: ApiKey; onSaved: () => void; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, PermissionValue>>({});
  const [accessMode, setAccessMode] = useState<"all" | "selected">("all");
  const [canCreateFolders, setCanCreateFolders] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEditing = !!apiKey;
  const selectedFolderIds = new Set(Object.keys(permissions));
  const selectedFolders = folders.filter((folder) => selectedFolderIds.has(folder.id));
  const folderMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return folders.filter((folder) => !folder.isPrivate && !selectedFolderIds.has(folder.id) && folder.title.toLowerCase().includes(q)).slice(0, 8);
  }, [folders, query, selectedFolderIds]);

  useEffect(() => {
    if (!open) return;
    setName(apiKey?.name ?? "");
    setQuery("");
    setCreatedKey(null);
    setCopied(false);
    setCanCreateFolders(apiKey?.canCreateFolders ?? false);
    setAccessMode(apiKey?.accessMode ?? "all");
    setPermissions(Object.fromEntries((apiKey?.permissions ?? []).map((permission) => [permission.folderId, { canRead: permission.canRead, canCreate: permission.canCreate, canEdit: permission.canEdit }])));
  }, [apiKey, open]);

  const close = () => setOpen(false);
  const addFolder = (folder: Folder) => {
    setPermissions((current) => ({ ...current, [folder.id]: { canRead: true, canCreate: false, canEdit: false } }));
    setQuery("");
  };
  const removeFolder = (folderId: string) => setPermissions((current) => {
    const next = { ...current };
    delete next[folderId];
    return next;
  });
  const selectedPermissions = () => Object.entries(permissions)
    .filter(([, permission]) => permission.canRead || permission.canCreate || permission.canEdit)
    .map(([folderId, permission]) => ({ folderId, ...permission }));

  const submit = async () => {
    setSaving(true);
    try {
      if (apiKey) {
        await api.updateApiKey(apiKey.id, { name, accessMode, canCreateFolders, permissions: accessMode === "selected" ? selectedPermissions() : [] });
        setOpen(false);
      } else {
        const result = await api.createApiKey({ name, accessMode, canCreateFolders, permissions: accessMode === "selected" ? selectedPermissions() : [] });
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
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{isEditing ? "Edit API key" : "Create API key"}</h2>
            <p className="mt-1 text-sm text-slate-500">Search for folders, add them, then choose access.</p>
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

          <label className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            <input className="mt-1" type="checkbox" checked={canCreateFolders} onChange={(e) => setCanCreateFolders(e.target.checked)} />
            <span>
              <span className="block font-medium">Allow folder creation</span>
              <span className="mt-1 block text-xs text-slate-500">New folders created by this key are automatically accessible to this key.</span>
            </span>
          </label>

          <div className="mt-4">
            <label className="text-sm font-medium">Folder access</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                <input className="mt-1" type="radio" checked={accessMode === "all"} onChange={() => setAccessMode("all")} />
                <span><span className="block font-medium">All non-private folders</span><span className="text-xs text-slate-500">Includes future non-private folders.</span></span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                <input className="mt-1" type="radio" checked={accessMode === "selected"} onChange={() => setAccessMode("selected")} />
                <span><span className="block font-medium">Selected folder branches</span><span className="text-xs text-slate-500">Selected folders include non-private subfolders.</span></span>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Private folders are never accessible to API keys, MCP, or integrations.</p>
            {accessMode === "selected" ? <input className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm dark:border-slate-800" placeholder="Search non-private folders to add..." value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
            {accessMode === "selected" && folderMatches.length > 0 ? <div className="mt-2 rounded-md border border-slate-200 dark:border-slate-800">
              {folderMatches.map((folder) => <button key={folder.id} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => addFolder(folder)}>
                <span>{folder.title}</span><Plus className="h-4 w-4 text-slate-500" />
              </button>)}
            </div> : accessMode === "selected" && query.trim() ? <p className="mt-2 text-xs text-slate-500">No matching non-private folders.</p> : null}
          </div>

          {accessMode === "selected" ? <div className="mt-4 space-y-2">
            {selectedFolders.map((folder) => <FolderPermissionRow key={folder.id} folder={folder} value={permissions[folder.id]} onChange={(value) => setPermissions((current) => ({ ...current, [folder.id]: value }))} onRemove={() => removeFolder(folder.id)} />)}
            {selectedFolders.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-800">No folders selected. Search and add non-private folders above.</p> : null}
          </div> : null}
          <div className="mt-4 flex justify-end"><Button disabled={!name.trim() || saving} onClick={submit}>{isEditing ? "Save changes" : "Create key"}</Button></div>
        </>}
      </div>
    </div> : null}
  </>;
}
