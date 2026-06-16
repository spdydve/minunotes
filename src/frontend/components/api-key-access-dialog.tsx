import { Check, Copy, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type ApiKey, type ApiKeyAccessMode, type Folder } from "../lib/api";
import { Button } from "./ui/button";

type PermissionValue = { canRead: boolean; canCreate: boolean; canEdit: boolean };

const defaultPermission: PermissionValue = { canRead: true, canCreate: false, canEdit: false };

function isEffectivelyPrivate(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current) {
    if (current.isPrivate) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

function folderPath(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const parts = [folder.title];
  let current = folder.parentFolderId ? byId.get(folder.parentFolderId) : undefined;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    parts.unshift(current.title);
    seen.add(current.id);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }

  return parts.join(" / ");
}

function isEffectivelyAgentReadOnly(folder: Folder, folders: Folder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let current: Folder | undefined = folder;
  const seen = new Set<string>();

  while (current) {
    if (current.isAgentReadOnly) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

function scopeLabel(mode: ApiKeyAccessMode) {
  if (mode === "all") return "All non-private folders";
  if (mode === "top_level") return "Project roots";
  return "Specific folders";
}

export function ApiKeyAccessDialog({ folders, apiKey, onSaved, trigger }: { folders: Folder[]; apiKey?: ApiKey; onSaved: () => void; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [accessMode, setAccessMode] = useState<ApiKeyAccessMode>("all");
  const [keyPermission, setKeyPermission] = useState<PermissionValue>(defaultPermission);
  const [canCreateFolders, setCanCreateFolders] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEditing = !!apiKey;
  const selectableFolders = useMemo(() => folders.filter((folder) => !isEffectivelyPrivate(folder, folders)), [folders]);
  const folderOptions = useMemo(() => {
    const candidates = accessMode === "top_level" ? selectableFolders.filter((folder) => folder.parentFolderId === null) : selectableFolders;
    const q = query.trim().toLowerCase();
    return candidates
      .filter((folder) => !selectedFolderIds.has(folder.id))
      .filter((folder) => !q || folder.title.toLowerCase().includes(q) || folderPath(folder, folders).toLowerCase().includes(q))
      .sort((a, b) => folderPath(a, folders).localeCompare(folderPath(b, folders)))
      .slice(0, 8);
  }, [accessMode, folders, query, selectableFolders, selectedFolderIds]);
  const selectedFolders = useMemo(() => selectableFolders
    .filter((folder) => selectedFolderIds.has(folder.id))
    .sort((a, b) => folderPath(a, folders).localeCompare(folderPath(b, folders))), [folders, selectableFolders, selectedFolderIds]);

  useEffect(() => {
    if (!open) return;
    setName(apiKey?.name ?? "");
    setQuery("");
    setCreatedKey(null);
    setCopied(false);
    setCanCreateFolders(apiKey?.canCreateFolders ?? false);
    setAccessMode(apiKey?.accessMode ?? "all");
    setKeyPermission(apiKey ? { canRead: apiKey.canRead, canCreate: apiKey.canCreate, canEdit: apiKey.canEdit } : defaultPermission);
    setSelectedFolderIds(new Set((apiKey?.permissions ?? []).map((permission) => permission.folderId)));
  }, [apiKey, open]);

  const close = () => setOpen(false);
  const addFolder = (folder: Folder) => {
    setSelectedFolderIds((current) => new Set(current).add(folder.id));
    setQuery("");
  };
  const removeFolder = (folderId: string) => setSelectedFolderIds((current) => {
    const next = new Set(current);
    next.delete(folderId);
    return next;
  });
  const selectedPermissions = () => [...selectedFolderIds].map((folderId) => ({ folderId, ...keyPermission }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = { name, accessMode, canCreateFolders, ...keyPermission, permissions: accessMode === "all" ? [] : selectedPermissions() };
      if (apiKey) {
        await api.updateApiKey(apiKey.id, payload);
        setOpen(false);
      } else {
        const result = await api.createApiKey(payload);
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
            <p className="mt-1 text-sm text-slate-500">Choose a scope, then set what this key can do there.</p>
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

          <div className="mt-4">
            <label className="text-sm font-medium">Scope</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["all", "top_level", "specific"] as const).map((mode) => <label key={mode} className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                <input className="mt-1" type="radio" checked={accessMode === mode} onChange={() => { setAccessMode(mode); setSelectedFolderIds(new Set()); setQuery(""); }} />
                <span>
                  <span className="block font-medium">{scopeLabel(mode)}</span>
                  <span className="text-xs text-slate-500">{mode === "all" ? "All except private/read-only limits." : mode === "top_level" ? "Selected roots include subfolders." : "Exact folder exceptions."}</span>
                </span>
              </label>)}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-sm font-medium">Permissions</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(["canRead", "canCreate", "canEdit"] as const).map((key) => <label key={key} className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={keyPermission[key]} onChange={(e) => setKeyPermission((current) => ({ ...current, [key]: e.target.checked }))} />
                {key === "canRead" ? "Read" : key === "canCreate" ? "Create" : "Edit"}
              </label>)}
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input className="mt-1" type="checkbox" checked={canCreateFolders} onChange={(e) => setCanCreateFolders(e.target.checked)} />
              <span>
                <span className="block font-medium">Allow folder creation</span>
                <span className="mt-1 block text-xs text-slate-500">New folders created by this key follow this key's scope.</span>
              </span>
            </label>
          </div>

          {accessMode !== "all" ? <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">{accessMode === "top_level" ? "Project roots" : "Specific folders"}</label>
            <input className="mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm dark:border-slate-800" placeholder={accessMode === "top_level" ? "Search top-level folders..." : "Search folders..."} value={query} onChange={(e) => setQuery(e.target.value)} />
            {folderOptions.length > 0 ? <div className="mt-2 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
              {folderOptions.map((folder) => <button key={folder.id} className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-900" onClick={() => addFolder(folder)}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{folder.title}{isEffectivelyAgentReadOnly(folder, folders) ? <span className="ml-2 text-xs text-amber-600">Read-only</span> : null}</span>
                  <span className="block truncate text-xs text-slate-500">{folderPath(folder, folders)}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-slate-500" />
              </button>)}
            </div> : query.trim() ? <p className="mt-2 text-xs text-slate-500">No matching folders.</p> : null}
            <div className="mt-3 space-y-2">
              {selectedFolders.map((folder) => <div key={folder.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{folder.title}{isEffectivelyAgentReadOnly(folder, folders) ? <span className="ml-2 text-xs text-amber-600">Read-only</span> : null}</span>
                  <span className="block truncate text-xs text-slate-500">{accessMode === "top_level" ? "Includes non-private subfolders" : folderPath(folder, folders)}</span>
                </span>
                <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-900" onClick={() => removeFolder(folder.id)} aria-label={`Remove ${folder.title}`}><X className="h-4 w-4" /></button>
              </div>)}
              {selectedFolders.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-800">No folders selected.</p> : null}
            </div>
          </div> : null}

          <div className="mt-4 flex justify-end"><Button disabled={!name.trim() || saving || (accessMode !== "all" && selectedFolderIds.size === 0) || !(keyPermission.canRead || keyPermission.canCreate || keyPermission.canEdit)} onClick={submit}>{isEditing ? "Save changes" : "Create key"}</Button></div>
        </>}
      </div>
    </div> : null}
  </>;
}
