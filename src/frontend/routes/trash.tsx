import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { TrashTable } from '../components/trash-table';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { rootRoute } from './__root';

function TrashView() {
  const trash = useQuery({ queryKey: ['trash'], queryFn: api.trash, retry: false });
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });

  if (trash.isLoading || folders.isLoading)
    return (
      <section className="mx-auto w-full max-w-5xl" aria-busy="true">
        <h2 className="font-semibold text-xl">Trash</h2>
        <p className="notes-muted mt-3 text-sm">Loading Trash...</p>
      </section>
    );

  if (trash.error || folders.error)
    return (
      <section className="mx-auto w-full max-w-5xl">
        <h2 className="font-semibold text-xl">Trash</h2>
        <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4" role="alert">
          <p className="font-medium text-red-600">Unable to load Trash</p>
          <p className="mt-1 text-red-600 text-sm">Check your connection and try again.</p>
          <Button
            className="mt-4"
            onClick={() => {
              void trash.refetch();
              void folders.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </section>
    );

  return (
    <section className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <h2 className="font-semibold text-xl">Trash</h2>
        <p className="notes-muted mt-1 text-sm">Restore recoverable content or permanently delete it.</p>
      </header>
      <TrashTable
        notes={trash.data?.notes ?? []}
        folders={trash.data?.folders ?? []}
        activeFolders={folders.data?.folders ?? []}
        retention={trash.data?.retention ?? { days: 30, automaticPurgeEnabled: false }}
      />
    </section>
  );
}

export const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  component: TrashView,
});
