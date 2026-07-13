import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Folder, type FolderShareLink } from '../lib/api';

export function FolderShareDialog({
  folder,
  open,
  onOpenChange,
}: {
  folder: Folder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['folder-share-link', folder.id],
    queryFn: () => api.folderShareLink(folder.id),
    enabled: open && !folder.isPrivate,
  });

  const create = useMutation<{ shareLink: FolderShareLink }, Error, boolean>({
    mutationFn: (regenerate) => api.createFolderShareLink(folder.id, regenerate),
    onSuccess: ({ shareLink }) => {
      setCreatedUrl(shareLink.url);
      qc.setQueryData(['folder-share-link', folder.id], { shareLink });
    },
  });

  const revoke = useMutation({
    mutationFn: () => api.revokeFolderShareLink(folder.id),
    onSuccess: () => {
      setCreatedUrl(null);
      qc.setQueryData(['folder-share-link', folder.id], { shareLink: null });
    },
  });

  useEffect(() => {
    if (!open) return;
    setCopied(false);
  }, [open]);

  if (!open) return null;

  const shareLink = data?.shareLink ?? null;
  const url = createdUrl ?? shareLink?.url ?? null;
  const linkSharingOn = Boolean(shareLink);
  const sharingDisabled = folder.isPrivate;

  const copy = async () => {
    if (sharingDisabled) return;
    let nextUrl = url;
    if (!nextUrl) {
      const result = await create.mutateAsync(false);
      nextUrl = result.shareLink.url;
    }
    if (!nextUrl) return;
    await navigator.clipboard.writeText(nextUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return createPortal(
    <div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--notes-border)] px-5 py-4">
          <h2 className="text-lg font-semibold">Share folder</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--notes-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--notes-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={sharingDisabled || isLoading || create.isPending}
              onClick={() => void copy()}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {create.isPending ? 'Creating...' : copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
              onClick={() => onOpenChange(false)}
              aria-label="Close share dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--notes-muted)]">Settings</h3>
            <div className="mt-3 space-y-3">
              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 text-sm font-medium">
                <Link2 className="h-4 w-4" />
                <select
                  className="bg-transparent outline-none"
                  value={linkSharingOn ? 'read' : 'none'}
                  disabled={sharingDisabled || isLoading || create.isPending || revoke.isPending}
                  onChange={(event) => {
                    if (event.target.value === 'read') create.mutate(false);
                    else revoke.mutate();
                  }}
                >
                  <option value="none">No link access</option>
                  <option value="read">Anyone with the link can View</option>
                </select>
              </label>
              <p className="notes-muted text-sm">
                {sharingDisabled
                  ? 'Private folders cannot be shared. Turn off private access before enabling a public link.'
                  : linkSharingOn
                    ? 'This folder is publicly viewable by anyone with the link. Editing is disabled.'
                    : 'Only you can access this folder unless link sharing is enabled.'}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--notes-muted)]">Access</h3>
            {isLoading ? <p className="notes-muted text-sm">Loading share settings...</p> : null}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-3">
              <div>
                <p className="text-sm font-medium">{folder.title}</p>
                <p className="notes-muted text-xs">You are the owner</p>
              </div>
              <span className="notes-muted text-sm">Author</span>
            </div>
          </section>

          <div className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-3 text-sm text-[var(--notes-muted)]">
            Shared folders are public and read-only. Only notes directly in this folder are exposed; subfolders,
            templates, folder settings, API settings, and edit controls are not exposed.
          </div>

          {create.isError ? <p className="text-sm text-red-600">Unable to create share link.</p> : null}
          {revoke.isError ? <p className="text-sm text-red-600">Unable to turn off link access.</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
