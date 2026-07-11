import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { ApiError, api, type Note } from '../lib/api';
import { rootRoute } from './__root';

function applyTemplateVariables(content: string, title: string) {
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return content
    .replaceAll('{{title}}', title)
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
    .replaceAll('{{datetime}}', `${date} ${time}`);
}

function NewFromTemplateView() {
  const { folderId } = newFromTemplateRoute.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const templates = useQuery({
    queryKey: ['folder-templates', folderId],
    queryFn: () => api.folderTemplates(folderId),
  });
  const folder = folders.data?.folders.find((item) => item.id === folderId);

  useEffect(() => {
    const assignedTemplates = templates.data?.templates ?? [];
    if (selectedId || assignedTemplates.length !== 1) return;
    setSelectedId(assignedTemplates[0].id);
  }, [selectedId, templates.data]);

  const selected = useMemo(
    () => templates.data?.templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates.data]
  );
  const create = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a template');
      const noteTitle = title.trim() || 'Untitled note';
      return api.createNote(folderId, {
        title: noteTitle,
        content: applyTemplateVariables(selected.content, noteTitle),
        type: 'note',
      });
    },
    onSuccess: ({ note }) => {
      qc.invalidateQueries({ queryKey: ['notes', folderId] });
      nav({ to: '/notes/$noteId', params: { noteId: note.id } });
    },
  });

  if (folders.isLoading || templates.isLoading) return <p className="notes-muted text-sm">Loading templates...</p>;
  if (folders.error instanceof ApiError || !folder)
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <EmptyState title="Folder not found">
          <Button className="mt-4" onClick={() => nav({ to: '/' })}>
            Back to notes
          </Button>
        </EmptyState>
      </section>
    );

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-2">
        <p className="notes-muted text-sm">Creating in: {folder.title}</p>
        <h2 className="text-xl font-semibold">New note from template</h2>
      </div>
      {templates.data?.templates.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
          <div className="space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">
              Note title
            </label>
            <input
              className="notes-input w-full rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--notes-blue)]"
              placeholder="Untitled note"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="pt-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">
              Assigned templates
            </p>
            {templates.data.templates.map((template: Note) => (
              <button
                key={template.id}
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selectedId === template.id ? 'border-[var(--notes-blue)] bg-[var(--notes-hover)]' : 'border-[var(--notes-border)] hover:bg-[var(--notes-hover)]'}`}
                onClick={() => setSelectedId(template.id)}
              >
                <span className="block font-medium">{template.title}</span>
                <span className="notes-muted mt-1 line-clamp-2 block text-xs">
                  {template.content.trim() || 'Empty template'}
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-3 text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">Preview</p>
            <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--notes-text)]">
              {selected
                ? applyTemplateVariables(selected.content, title.trim() || 'Untitled note')
                : 'Select a template to preview it.'}
            </pre>
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <Button onClick={() => create.mutate()} disabled={!selected || create.isPending}>
              Create note
            </Button>
            <Button variant="secondary" onClick={() => nav({ to: '/folders/$folderId', params: { folderId } })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState title="No templates assigned">
          <p>Assign templates to this folder before creating notes from templates.</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => nav({ to: '/folders/$folderId/templates', params: { folderId } })}>
              Manage folder templates
            </Button>
            <Button variant="secondary" onClick={() => nav({ to: '/templates' })}>
              View templates
            </Button>
          </div>
        </EmptyState>
      )}
    </section>
  );
}

export const newFromTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/folders/$folderId/new-from-template',
  component: NewFromTemplateView,
});
