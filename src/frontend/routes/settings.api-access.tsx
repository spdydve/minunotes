import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiKeyAccessDialog } from '../components/api-key-access-dialog';
import { DeleteConfirmDialog } from '../components/delete-confirm-dialog';
import { OAuthAppDialog } from '../components/oauth-app-dialog';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { rootRoute } from './__root';

const showOAuthApps = import.meta.env.VITE_ENABLE_OAUTH_APPS === 'true';

function ApiAccessSettingsView() {
  const qc = useQueryClient();
  const [oauthAppOpen, setOAuthAppOpen] = useState(false);
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: api.apiKeys });
  const oauthClients = useQuery({ queryKey: ['oauth-clients'], queryFn: api.oauthClients, enabled: showOAuthApps });
  const connectedApps = useQuery({
    queryKey: ['oauth-authorizations'],
    queryFn: api.oauthAuthorizations,
    enabled: showOAuthApps,
  });
  const revoke = useMutation({
    mutationFn: api.revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
  const revokeConnectedApp = useMutation({
    mutationFn: api.revokeOAuthAuthorization,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oauth-authorizations'] }),
  });
  const revokeOAuthClient = useMutation({
    mutationFn: api.revokeOAuthClient,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oauth-clients'] }),
  });

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
            ← Back to notes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">API Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage API keys for agents, scripts, MCP stdio, and trusted automation.
          </p>
        </div>
        <ApiKeyAccessDialog
          folders={folders.data?.folders ?? []}
          onSaved={() => qc.invalidateQueries({ queryKey: ['api-keys'] })}
          trigger={(open) => <Button onClick={open}>Create key</Button>}
        />
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-[var(--notes-muted)]">
          Manual tokens for local agents, scripts, MCP stdio, and trusted automation.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
        <div className="hidden grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] gap-3 border-b border-[var(--notes-border)] bg-[var(--notes-table-header-bg)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)] md:grid">
          <span>Name</span>
          <span>UID</span>
          <span>Created</span>
          <span>Last used</span>
          <span>Status</span>
        </div>
        {keys.isLoading ? <p className="p-4 text-sm text-slate-500">Loading keys...</p> : null}
        {(keys.data?.keys ?? []).map((key) => (
          <div
            key={key.id}
            className="grid gap-3 border-b border-[var(--notes-table-row-border)] px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-[var(--notes-table-row-hover)] md:grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] md:items-center md:py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{key.name}</p>
            </div>
            <code className="text-xs text-[var(--notes-muted)]">
              <span className="md:hidden">UID </span>
              {key.uid}
            </code>
            <span className="text-xs text-[var(--notes-muted)]">
              <span className="md:hidden">Created </span>
              {new Date(key.createdAt).toLocaleString()}
            </span>
            <span className="text-xs text-[var(--notes-muted)]">
              <span className="md:hidden">Last used </span>
              {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
            </span>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <ApiKeyAccessDialog
                folders={folders.data?.folders ?? []}
                apiKey={key}
                onSaved={() => qc.invalidateQueries({ queryKey: ['api-keys'] })}
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
        {keys.data?.keys.length === 0 ? <p className="p-4 text-sm text-slate-500">No agent keys yet.</p> : null}
      </div>

      {showOAuthApps ? (
        <>
          <div className="mb-4 mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Apps</h2>
              <p className="mt-1 text-sm text-[var(--notes-muted)]">
                App clients that can request user consent through OAuth + PKCE.
              </p>
            </div>
            <Button onClick={() => setOAuthAppOpen(true)}>Add App</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
            <div className="hidden grid-cols-[1.3fr_1.2fr_1fr_auto] gap-3 border-b border-[var(--notes-border)] bg-[var(--notes-table-header-bg)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)] md:grid">
              <span>Name</span>
              <span>Client ID</span>
              <span>Created</span>
              <span>Status</span>
            </div>
            {oauthClients.isLoading ? <p className="p-4 text-sm text-slate-500">Loading apps...</p> : null}
            {(oauthClients.data?.clients ?? []).map((client) => (
              <div
                key={client.id}
                className="grid gap-3 border-b border-[var(--notes-table-row-border)] px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-[var(--notes-table-row-hover)] md:grid-cols-[1.3fr_1.2fr_1fr_auto] md:items-center md:py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{client.name}</p>
                  {client.description ? (
                    <p className="notes-muted mt-0.5 truncate text-xs">{client.description}</p>
                  ) : null}
                </div>
                <code className="break-all text-xs text-[var(--notes-muted)]">
                  <span className="md:hidden">Client ID </span>
                  {client.id}
                </code>
                <span className="text-xs text-[var(--notes-muted)]">
                  <span className="md:hidden">Created </span>
                  {new Date(client.createdAt).toLocaleString()}
                </span>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {client.revokedAt ? (
                    <Button disabled>Revoked</Button>
                  ) : (
                    <DeleteConfirmDialog
                      label="app"
                      warning="This app will be revoked and its connected app tokens will stop working."
                      onConfirm={() => revokeOAuthClient.mutate(client.id)}
                      trigger={<Button disabled={revokeOAuthClient.isPending}>Revoke</Button>}
                    />
                  )}
                </div>
              </div>
            ))}
            {oauthClients.data?.clients.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No apps yet.</p>
            ) : null}
          </div>

          <div className="mb-4 mt-8">
            <h2 className="text-lg font-semibold">Connected apps</h2>
            <p className="mt-1 text-sm text-[var(--notes-muted)]">
              OAuth apps authorized through MinuNotes, such as hosted MCP or ChatGPT-style connectors.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
            <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_auto] gap-3 border-b border-[var(--notes-border)] bg-[var(--notes-table-header-bg)] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)] md:grid">
              <span>App</span>
              <span>Access</span>
              <span>Connected</span>
              <span>Last used</span>
              <span>Status</span>
            </div>
            {connectedApps.isLoading ? <p className="p-4 text-sm text-slate-500">Loading connected apps...</p> : null}
            {(connectedApps.data?.authorizations ?? []).map((authorization) => {
              const access =
                authorization.accessMode === 'all'
                  ? 'All non-private folders'
                  : authorization.accessMode === 'top_level'
                    ? `${authorization.permissions.length} project root${authorization.permissions.length === 1 ? '' : 's'}`
                    : `${authorization.permissions.length} specific folder${authorization.permissions.length === 1 ? '' : 's'}`;
              const permissions =
                [
                  authorization.canRead ? 'Read' : null,
                  authorization.canCreate ? 'Create' : null,
                  authorization.canEdit ? 'Edit' : null,
                  authorization.canCreateFolders ? 'Create folders' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No permissions';
              return (
                <div
                  key={authorization.id}
                  className="grid gap-3 border-b border-[var(--notes-table-row-border)] px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-[var(--notes-table-row-hover)] md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center md:py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{authorization.client.name}</p>
                    {authorization.client.description ? (
                      <p className="notes-muted mt-0.5 truncate text-xs">{authorization.client.description}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-[var(--notes-muted)]">
                    <span className="md:hidden">Access </span>
                    {access}
                    <br />
                    {permissions}
                  </span>
                  <span className="text-xs text-[var(--notes-muted)]">
                    <span className="md:hidden">Connected </span>
                    {new Date(authorization.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs text-[var(--notes-muted)]">
                    <span className="md:hidden">Last used </span>
                    {authorization.lastUsedAt ? new Date(authorization.lastUsedAt).toLocaleString() : 'Never'}
                  </span>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {authorization.revokedAt ? (
                      <Button disabled>Revoked</Button>
                    ) : (
                      <DeleteConfirmDialog
                        label="connected app"
                        warning="This app will immediately lose access to MinuNotes and cannot use existing tokens."
                        onConfirm={() => revokeConnectedApp.mutate(authorization.id)}
                        trigger={<Button disabled={revokeConnectedApp.isPending}>Revoke</Button>}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {connectedApps.data?.authorizations.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No connected apps yet.</p>
            ) : null}
          </div>
          <OAuthAppDialog
            open={oauthAppOpen}
            onOpenChange={setOAuthAppOpen}
            onCreated={() => qc.invalidateQueries({ queryKey: ['oauth-clients'] })}
          />
        </>
      ) : null}
    </section>
  );
}

export const apiAccessSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/api-access',
  component: ApiAccessSettingsView,
});
