import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { ApiKeyAccessDialog } from "../components/api-key-access-dialog";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
import { Button } from "../components/ui/button";
import { rootRoute } from "./__root";

function ApiAccessSettingsView() {
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });
  const revoke = useMutation({
    mutationFn: api.revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/"
            className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            ← Back to notes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">API Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage API keys for agents, scripts, and external tools.
          </p>
        </div>
        <ApiKeyAccessDialog
          folders={folders.data?.folders ?? []}
          onSaved={() => qc.invalidateQueries({ queryKey: ["api-keys"] })}
          trigger={(open) => <Button onClick={open}>Create key</Button>}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
        <div className="hidden grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] gap-3 border-b border-[var(--notes-border)] bg-[var(--notes-table-header-bg)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)] md:grid">
          <span>Name</span>
          <span>UID</span>
          <span>Created</span>
          <span>Last used</span>
          <span>Status</span>
        </div>
        {keys.isLoading ? (
          <p className="p-4 text-sm text-slate-500">Loading keys...</p>
        ) : null}
        {(keys.data?.keys ?? []).map((key) => (
          <div
            key={key.id}
            className="grid gap-3 border-b border-[var(--notes-table-row-border)] px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-[var(--notes-table-row-hover)] md:grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] md:items-center md:py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{key.name}</p>
              <p className="text-xs text-slate-500">{key.accessMode === "all" ? "All non-private folders" : `${key.permissions.length} selected folder branch${key.permissions.length === 1 ? "" : "es"}`}</p>
            </div>
            <code className="text-xs text-[var(--notes-muted)]"><span className="md:hidden">UID </span>{key.uid}</code>
            <span className="text-xs text-[var(--notes-muted)]"><span className="md:hidden">Created </span>
              {new Date(key.createdAt).toLocaleString()}
            </span>
            <span className="text-xs text-[var(--notes-muted)]">
              <span className="md:hidden">Last used </span>{key.lastUsedAt
                ? new Date(key.lastUsedAt).toLocaleString()
                : "Never"}
            </span>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <ApiKeyAccessDialog
                folders={folders.data?.folders ?? []}
                apiKey={key}
                onSaved={() => qc.invalidateQueries({ queryKey: ["api-keys"] })}
                trigger={(open) => (
                  <Button disabled={!!key.revokedAt} onClick={open}>
                    Edit
                  </Button>
                )}
              />
              {key.revokedAt ? (
                <Button disabled>Revoked</Button>
              ) : (
                <DeleteConfirmDialog
                  label="API key"
                  warning="This API key will immediately lose access to all folders and cannot be restored."
                  onConfirm={() => revoke.mutate(key.id)}
                  trigger={<Button disabled={revoke.isPending}>Revoke</Button>}
                />
              )}
            </div>
          </div>
        ))}
        {keys.data?.keys.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No agent keys yet.</p>
        ) : null}
      </div>
    </section>
  );
}

export const apiAccessSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/api-access",
  component: ApiAccessSettingsView,
});
