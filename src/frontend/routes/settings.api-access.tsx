import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { ApiKeyAccessDialog } from "../components/api-key-access-dialog";
import { Button } from "../components/ui/button";
import { rootRoute } from "./__root";

function ApiAccessSettingsView() {
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });
  const revoke = useMutation({ mutationFn: api.revokeApiKey, onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }) });

  return <section className="mx-auto w-full max-w-5xl">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <Link to="/" className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">← Back to notes</Link>
        <h1 className="mt-2 text-2xl font-semibold">API Access</h1>
        <p className="mt-1 text-sm text-slate-500">Create and manage API keys for agents, scripts, and external tools.</p>
      </div>
      <ApiKeyAccessDialog folders={folders.data?.folders ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["api-keys"] })} trigger={(open) => <Button onClick={open}>Create key</Button>} />
    </div>

    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="grid grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800">
        <span>Name</span><span>UID</span><span>Created</span><span>Last used</span><span>Status</span>
      </div>
      {keys.isLoading ? <p className="p-4 text-sm text-slate-500">Loading keys...</p> : null}
      {(keys.data?.keys ?? []).map((key) => <div key={key.id} className="grid grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-900">
        <div className="min-w-0">
          <p className="truncate font-medium">{key.name}</p>
          <p className="text-xs text-slate-500">{key.permissions.length} folder permission{key.permissions.length === 1 ? "" : "s"}</p>
        </div>
        <code className="text-xs text-slate-500">{key.uid}</code>
        <span className="text-xs text-slate-500">{new Date(key.createdAt).toLocaleString()}</span>
        <span className="text-xs text-slate-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</span>
        <div className="flex justify-end gap-2">
          <ApiKeyAccessDialog folders={folders.data?.folders ?? []} apiKey={key} onSaved={() => qc.invalidateQueries({ queryKey: ["api-keys"] })} trigger={(open) => <Button disabled={!!key.revokedAt} onClick={open}>Edit</Button>} />
          <Button disabled={!!key.revokedAt || revoke.isPending} onClick={() => revoke.mutate(key.id)}>{key.revokedAt ? "Revoked" : "Revoke"}</Button>
        </div>
      </div>)}
      {keys.data?.keys.length === 0 ? <p className="p-4 text-sm text-slate-500">No agent keys yet.</p> : null}
    </div>
  </section>;
}

export const apiAccessSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/api-access", component: ApiAccessSettingsView });
