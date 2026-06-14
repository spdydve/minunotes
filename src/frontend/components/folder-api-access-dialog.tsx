import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type ApiKey, type Folder } from "../lib/api";
import { Button } from "./ui/button";

type PermissionValue = { canRead: boolean; canCreate: boolean; canEdit: boolean };

function permissionForFolder(key: ApiKey, folderId: string): PermissionValue {
  const permission = key.permissions.find((item) => item.folderId === folderId);
  return { canRead: permission?.canRead ?? false, canCreate: permission?.canCreate ?? false, canEdit: permission?.canEdit ?? false };
}

export function FolderApiAccessDialog({ folder, open, onOpenChange }: { folder: Folder; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys, enabled: open });
  const [values, setValues] = useState<Record<string, PermissionValue>>({});
  const update = useMutation({ mutationFn: ({ key, value }: { key: ApiKey; value: PermissionValue }) => {
    const otherPermissions = key.permissions
      .filter((permission) => permission.folderId !== folder.id)
      .map((permission) => ({ folderId: permission.folderId, canRead: permission.canRead, canCreate: permission.canCreate, canEdit: permission.canEdit }));
    const permissions = value.canRead || value.canCreate || value.canEdit ? [...otherPermissions, { folderId: folder.id, ...value }] : otherPermissions;
    return api.updateApiKey(key.id, { accessMode: "selected", permissions });
  } });

  useEffect(() => {
    if (!open || !keys.data) return;
    setValues(Object.fromEntries(keys.data.keys.map((key) => [key.id, permissionForFolder(key, folder.id)])));
  }, [folder.id, keys.data, open]);

  const save = async () => {
    const currentKeys = keys.data?.keys ?? [];
    for (const key of currentKeys) {
      const next = values[key.id] ?? { canRead: false, canCreate: false, canEdit: false };
      const previous = permissionForFolder(key, folder.id);
      if (next.canRead === previous.canRead && next.canCreate === previous.canCreate && next.canEdit === previous.canEdit) continue;
      await update.mutateAsync({ key, value: next });
    }
    await qc.invalidateQueries({ queryKey: ["api-keys"] });
    onOpenChange(false);
  };

  if (!open) return null;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">API Access</h2>
          <p className="mt-1 text-sm text-slate-500">Manage API key access for folder: <span className="font-medium text-slate-700 dark:text-slate-300">{folder.title}</span></p>
        </div>
        <Button onClick={() => onOpenChange(false)}>Close</Button>
      </div>

      {folder.isPrivate ? <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">Private folders are not accessible to API keys, MCP, or integrations.</p> : null}

      <div className="mt-4 space-y-2">
        {keys.isLoading ? <p className="text-sm text-slate-500">Loading API keys...</p> : null}
        {(keys.data?.keys ?? []).filter((key) => !key.revokedAt).map((key) => {
          const value = values[key.id] ?? { canRead: false, canCreate: false, canEdit: false };
          const disabled = folder.isPrivate || key.accessMode === "all";
          return <div key={key.id} className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 sm:grid-cols-[1fr_repeat(3,auto)] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-medium">{key.name}</p>
              <p className="text-xs text-slate-500">UID: {key.uid}{key.accessMode === "all" ? " · All non-private folders" : ""}</p>
            </div>
            {(["canRead", "canCreate", "canEdit"] as const).map((permission) => <label key={permission} className="flex items-center gap-1 text-xs text-slate-500">
              <input type="checkbox" disabled={disabled} checked={key.accessMode === "all" && !folder.isPrivate ? true : value[permission]} onChange={(e) => setValues((current) => ({ ...current, [key.id]: { ...value, [permission]: e.target.checked } }))} />
              {permission === "canRead" ? "Read" : permission === "canCreate" ? "Create" : "Edit"}
            </label>)}
          </div>;
        })}
        {keys.data?.keys.filter((key) => !key.revokedAt).length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-800">No active API keys.</p> : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={update.isPending || keys.isLoading || folder.isPrivate} onClick={save}>Save changes</Button>
      </div>
    </div>
  </div>;
}
