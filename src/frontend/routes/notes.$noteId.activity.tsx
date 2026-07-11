import { useQuery } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';
import { ApiError, api } from '../lib/api';
import { rootRoute } from './__root';

function NoteActivityView() {
  const { noteId } = noteActivityRoute.useParams();
  const note = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => api.note(noteId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const activity = useQuery({
    queryKey: ['note-events', noteId],
    queryFn: () => api.noteEvents(noteId, 50),
    retry: 1,
  });

  if (note.isLoading) return <p className="text-sm text-slate-500">Loading activity...</p>;
  if (note.error instanceof ApiError && note.error.status === 404)
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <div className="w-full max-w-lg rounded-lg border border-dashed p-8 text-center">
          <h2 className="text-xl font-semibold">Note not found</h2>
          <p className="mt-2 text-sm text-slate-500">This note does not exist or you do not have access to it.</p>
          <Link
            className="mt-4 inline-block rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
            to="/"
          >
            Back to notes
          </Link>
        </div>
      </section>
    );

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Note activity</p>
          <h1 className="text-2xl font-semibold">{note.data?.note.title ?? 'Activity'}</h1>
        </div>
        <Link
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          to="/notes/$noteId"
          params={{ noteId }}
        >
          Back to note
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Activity</h2>
          <p className="text-xs text-slate-500">Recent read-only note events.</p>
        </div>

        {activity.isLoading ? <p className="text-sm text-slate-500">Loading activity...</p> : null}
        {activity.error ? <p className="text-sm text-rose-600 dark:text-rose-400">Unable to load activity.</p> : null}
        {!activity.isLoading && !activity.error && (activity.data?.events.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : null}

        {(activity.data?.events ?? []).length > 0 ? (
          <ul className="space-y-3">
            {activity.data?.events.map((event) => (
              <li key={event.id} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{event.summary}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {event.eventType}
                  </span>
                  <span className="text-xs text-slate-500">
                    {event.actorType}
                    {event.actorId ? ` · ${event.actorId}` : ''}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                  {event.beforeHash || event.afterHash ? (
                    <span>
                      hash {event.beforeHash?.slice(0, 8) ?? '-'} → {event.afterHash?.slice(0, 8) ?? '-'}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export const noteActivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes/$noteId/activity',
  component: NoteActivityView,
});
