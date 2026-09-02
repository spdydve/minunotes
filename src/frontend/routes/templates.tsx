import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { NotesTable } from '../components/notes-table';
import { PaginationControls } from '../components/pagination-controls';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { api } from '../lib/api';
import { rootRoute } from './__root';

function TemplatesView() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const templates = useQuery({
    queryKey: ['templates', page],
    queryFn: () => api.templates(page),
  });
  const create = useMutation({
    mutationFn: async () => {
      const folder =
        folders.data?.folders[0] ??
        (
          await qc.fetchQuery({
            queryKey: ['folders'],
            queryFn: api.folders,
          })
        ).folders[0];
      if (!folder) throw new Error('Create a folder before creating templates.');
      return api.createNote(folder.id, { title: 'Untitled template', type: 'template' });
    },
    onSuccess: ({ note }) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['notes', note.folderId, 'template'] });
      nav({ to: '/notes/$noteId', params: { noteId: note.id } });
    },
  });

  if (templates.isLoading) return <p className="notes-muted text-sm">Loading templates...</p>;
  if (folders.isSuccess && !folders.data.folders.length)
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <EmptyState title="Create a folder first">
          <p>Templates are markdown notes and need a workspace folder before they can be created.</p>
          <Button className="mt-4" onClick={() => nav({ to: '/' })}>
            Back to notes
          </Button>
        </EmptyState>
      </section>
    );

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-xl">Templates</h2>
          <p className="notes-muted mt-1 text-sm">Reusable markdown notes for creating new notes.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          New template
        </Button>
      </div>
      {create.error ? (
        <p className="mb-4 text-red-500 text-sm">
          {create.error instanceof Error ? create.error.message : 'Unable to create template'}
        </p>
      ) : null}
      {templates.data?.templates.length ? (
        <NotesTable notes={templates.data.templates} queryKey={['templates']} />
      ) : (
        <EmptyState title="No templates yet">
          <p>Create your first template to reuse note structure and content.</p>
        </EmptyState>
      )}
      <PaginationControls
        page={templates.data?.page ?? page}
        hasMore={templates.data?.hasMore ?? false}
        onPageChange={setPage}
      />
    </section>
  );
}

export const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates',
  component: TemplatesView,
});
