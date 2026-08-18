import { useQuery } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { SharingPageTabs } from '../components/sharing-page-tabs';
import { EmptyState } from '../components/ui/empty-state';
import { api, type CollaborationResourceType, type SharedCollaboration } from '../lib/api';
import { rootRoute } from './__root';

const ROLE_LABEL = { viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor', owner: 'Owner' } as const;
const PAGE_SIZE = 25;

function SharedWithMeView() {
  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Shared with me</h1>
        <p className="notes-muted mt-1 text-sm">Notes and folder roots other people have shared with you.</p>
      </div>
      <SharingPageTabs current="with-me" />
      <div className="space-y-8">
        <SharedResourceTable type="note" />
        <SharedResourceTable type="folder" />
      </div>
    </section>
  );
}

function SharedResourceTable({ type }: { type: CollaborationResourceType }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({
    queryKey: ['shared-with-me', type, cursor],
    queryFn: () => api.sharedWithMePage(type, cursor, PAGE_SIZE),
  });
  const title = type === 'note' ? 'Notes' : 'Folders';
  const items = query.data?.collaborations ?? [];

  return (
    <section aria-labelledby={`shared-${type}-heading`}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id={`shared-${type}-heading`} className="font-semibold text-lg">
            {title}
          </h2>
          <p className="notes-muted text-xs">
            Showing up to {PAGE_SIZE} shared {title.toLowerCase()} per page.
          </p>
        </div>
        <PaginationControls
          canGoBack={cursors.length > 1}
          canGoForward={Boolean(query.data?.pageInfo.hasMore && query.data.pageInfo.nextCursor)}
          disabled={query.isFetching}
          onBack={() => setCursors((current) => current.slice(0, -1))}
          onForward={() => {
            const nextCursor = query.data?.pageInfo.nextCursor;
            if (nextCursor) setCursors((current) => [...current, nextCursor]);
          }}
        />
      </div>

      {query.isLoading ? <p className="notes-muted text-sm">Loading shared {title.toLowerCase()}…</p> : null}
      {query.error ? (
        <EmptyState title={`Unable to load shared ${title.toLowerCase()}`}>Try refreshing the page.</EmptyState>
      ) : null}
      {!query.isLoading && !query.error ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--notes-border)]">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="bg-[var(--notes-panel-muted)] text-[var(--notes-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Shared by</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="notes-muted px-4 py-6 text-center" colSpan={4}>
                    No shared {title.toLowerCase()} on this page.
                  </td>
                </tr>
              ) : (
                items.map((item) => <SharedResourceRow key={item.grantId} item={item} />)
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function SharedResourceRow({ item }: { item: SharedCollaboration }) {
  const resource = item.type === 'note' ? item.note : item.folder;
  const link =
    item.type === 'note' ? (
      <Link
        to="/notes/$noteId"
        params={{ noteId: item.note.id }}
        className="font-medium text-[var(--notes-blue)] hover:underline"
      >
        {item.note.title}
      </Link>
    ) : (
      <Link
        to="/folders/$folderId"
        params={{ folderId: item.folder.id }}
        className="font-medium text-[var(--notes-blue)] hover:underline"
      >
        {item.folder.title}
      </Link>
    );
  return (
    <tr className="border-t border-[var(--notes-border)] hover:bg-[var(--notes-hover)]">
      <td className="max-w-sm px-4 py-3">{link}</td>
      <td className="px-4 py-3">{item.owner.label}</td>
      <td className="px-4 py-3">{ROLE_LABEL[item.role]}</td>
      <td className="px-4 py-3 text-[var(--notes-muted)]">{new Date(resource.updatedAt).toLocaleDateString()}</td>
    </tr>
  );
}

function PaginationControls({
  canGoBack,
  canGoForward,
  disabled,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  disabled: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const className =
    'rounded-md border border-[var(--notes-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--notes-hover)] disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={className} disabled={disabled || !canGoBack} onClick={onBack}>
        Previous
      </button>
      <button type="button" className={className} disabled={disabled || !canGoForward} onClick={onForward}>
        Next
      </button>
    </div>
  );
}

export const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared',
  component: SharedWithMeView,
});
