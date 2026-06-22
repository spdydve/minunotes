import { useMutation, useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { api, type ApiKeyAccessMode, type Folder, type OAuthAuthorizeRequest } from "../lib/api";
import { Button } from "../components/ui/button";
import { rootRoute } from "./__root";

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

function getAuthorizeRequest(): OAuthAuthorizeRequest | null {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) return null;
  return {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    ...(params.get("state") ? { state: params.get("state")! } : {}),
    ...(params.get("scope") ? { scope: params.get("scope")! } : {}),
  };
}

function OAuthAuthorizeView() {
  const request = useMemo(() => getAuthorizeRequest(), []);
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const preview = useQuery({ queryKey: ["oauth-authorize-preview", request], queryFn: () => api.oauthAuthorizePreview(request!), enabled: Boolean(request) });
  const [accessMode, setAccessMode] = useState<ApiKeyAccessMode>("all");
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [canRead, setCanRead] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canCreateFolders, setCanCreateFolders] = useState(false);

  const selectableFolders = useMemo(() => (folders.data?.folders ?? []).filter((folder) => !isEffectivelyPrivate(folder, folders.data?.folders ?? [])), [folders.data?.folders]);
  const folderOptions = useMemo(() => {
    const options = accessMode === "top_level" ? selectableFolders.filter((folder) => folder.parentFolderId === null) : selectableFolders;
    return options.sort((a, b) => folderPath(a, selectableFolders).localeCompare(folderPath(b, selectableFolders)));
  }, [accessMode, selectableFolders]);

  const approve = useMutation({
    mutationFn: () => api.approveOAuthAuthorization({
      ...request!,
      accessMode,
      canRead,
      canCreate,
      canEdit,
      canCreateFolders,
      folderIds: [...selectedFolderIds],
    }),
    onSuccess: ({ redirectUrl }) => {
      window.location.href = redirectUrl;
    },
  });

  if (!request) return <section className="mx-auto max-w-xl rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-6"><h1 className="text-xl font-semibold">Invalid OAuth request</h1><p className="notes-muted mt-2 text-sm">The authorization request is missing required parameters.</p></section>;
  if (preview.isLoading || folders.isLoading) return <p className="notes-muted text-sm">Loading authorization request...</p>;
  if (preview.error) return <section className="mx-auto max-w-xl rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-6"><h1 className="text-xl font-semibold">Unable to authorize app</h1><p className="notes-muted mt-2 text-sm">This OAuth request is invalid or the app is not registered.</p></section>;

  const appName = preview.data?.client.name ?? "This app";
  const selectedCount = selectedFolderIds.size;
  const canSubmit = (canRead || canCreate || canEdit) && (accessMode === "all" || selectedCount > 0) && !approve.isPending;

  return <section className="mx-auto w-full max-w-3xl">
    <Link to="/settings/api-access" className="text-xs text-[var(--notes-muted)] hover:text-[var(--notes-text)]">← API Access</Link>
    <div className="mt-4 rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] p-5 shadow-sm">
      <h1 className="text-2xl font-semibold">Authorize {appName}</h1>
      <p className="notes-muted mt-2 text-sm">Choose what this app can access in MinuNotes.</p>
      {preview.data?.client.description ? <p className="notes-muted mt-1 text-sm">{preview.data.client.description}</p> : null}
      <p className="notes-muted mt-3 break-all rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] p-3 text-xs">Redirect URI: {preview.data?.request.redirectUri}</p>

      <div className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--notes-muted)]">Scope</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(["all", "top_level", "specific"] as const).map((mode) => <label key={mode} className="flex items-start gap-2 rounded-md border border-[var(--notes-border)] p-3 text-sm">
            <input className="mt-1" type="radio" checked={accessMode === mode} onChange={() => { setAccessMode(mode); setSelectedFolderIds(new Set()); }} />
            <span><span className="block font-medium">{mode === "all" ? "All non-private" : mode === "top_level" ? "Project roots" : "Specific folders"}</span><span className="notes-muted text-xs">{mode === "all" ? "All folders except private ones." : mode === "top_level" ? "Selected roots include subfolders." : "Exact folder access."}</span></span>
          </label>)}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--notes-border)] p-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--notes-muted)]">Permissions</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={canRead} onChange={(e) => setCanRead(e.target.checked)} />Read</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={canCreate} onChange={(e) => setCanCreate(e.target.checked)} />Create notes</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} />Edit notes</label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={canCreateFolders} onChange={(e) => setCanCreateFolders(e.target.checked)} /><span><span className="block font-medium">Allow folder creation</span><span className="notes-muted text-xs">New folders created by this app follow this authorization scope.</span></span></label>
      </div>

      {accessMode !== "all" ? <div className="mt-5 rounded-lg border border-[var(--notes-border)] p-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--notes-muted)]">{accessMode === "top_level" ? "Project roots" : "Specific folders"}</h2>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {folderOptions.map((folder) => <label key={folder.id} className="flex items-start gap-3 rounded-md border border-[var(--notes-border)] px-3 py-2 text-sm">
            <input className="mt-1" type="checkbox" checked={selectedFolderIds.has(folder.id)} onChange={(event) => setSelectedFolderIds((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(folder.id); else next.delete(folder.id);
              return next;
            })} />
            <span className="min-w-0"><span className="block truncate font-medium">{folder.title}</span><span className="notes-muted block truncate text-xs">{accessMode === "top_level" ? "Includes non-private subfolders" : folderPath(folder, selectableFolders)}</span></span>
          </label>)}
        </div>
      </div> : null}

      {approve.error ? <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{approve.error instanceof Error ? approve.error.message : "Unable to authorize app"}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={() => window.location.href = preview.data?.request.redirectUri ?? "/"}>Cancel</Button>
        <Button variant="base" disabled={!canSubmit} onClick={() => approve.mutate()}>{approve.isPending ? "Authorizing..." : "Allow access"}</Button>
      </div>
    </div>
  </section>;
}

export const oauthAuthorizeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/oauth/authorize", component: OAuthAuthorizeView });
