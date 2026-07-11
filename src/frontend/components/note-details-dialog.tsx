import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Note } from '../lib/api';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  return new Date(value).toISOString();
}

function normalizeTagName(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function NoteDetailsDialog({
  note,
  open,
  onOpenChange,
  onNoteUpdated,
}: {
  note: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNoteUpdated?: (response: { note: Note; contentHash: string }) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [createdAt, setCreatedAt] = useState(toDatetimeLocalValue(note.createdAt));
  const [isApiEditable, setIsApiEditable] = useState(note.isApiEditable);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagInputFocused, setTagInputFocused] = useState(false);
  const { data: foldersData } = useQuery({ queryKey: ['folders'], queryFn: api.folders, enabled: open });
  const { data: allTagsData } = useQuery({ queryKey: ['tags'], queryFn: api.tags, enabled: open });
  const { data: tagsData, isLoading } = useQuery({
    queryKey: ['note-tags', note.id],
    queryFn: () => api.noteTags(note.id),
    enabled: open,
  });

  const folderTitle = useMemo(
    () => foldersData?.folders.find((folder) => folder.id === note.folderId)?.title ?? note.folderId,
    [foldersData, note.folderId]
  );

  useEffect(() => {
    if (!open) return;
    setTitle(note.title);
    setCreatedAt(toDatetimeLocalValue(note.createdAt));
    setIsApiEditable(note.isApiEditable);
    setTagNames((tagsData?.tags ?? []).map((tag) => tag.name));
    setTagDraft('');
  }, [open, note.createdAt, note.isApiEditable, note.title, tagsData]);

  const updateTags = useMutation({
    mutationFn: (nextTags: string[]) => api.updateNoteTags(note.id, nextTags),
    onSuccess: (data) => {
      setTagNames(data.tags.map((tag) => tag.name));
      qc.setQueryData(['note-tags', note.id], data);
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const saveDetails = useMutation({
    mutationFn: async () => {
      let response: { note: Note; contentHash: string } | null = null;
      const nextTitle = title.trim() || 'Untitled note';
      const nextCreatedAt = fromDatetimeLocalValue(createdAt);
      if (nextTitle !== note.title || isApiEditable !== note.isApiEditable || nextCreatedAt !== note.createdAt) {
        response = await api.saveNote(note.id, { title: nextTitle, isApiEditable, createdAt: nextCreatedAt });
      }
      const draft = normalizeTagName(tagDraft);
      if (draft && !tagNames.includes(draft)) {
        await updateTags.mutateAsync([...tagNames, draft]);
        setTagDraft('');
      }
      return { response };
    },
    onSuccess: ({ response }) => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: ['templates'] });
      if (response) onNoteUpdated?.(response);
      onOpenChange(false);
    },
  });

  const persistTags = (nextTags: string[]) => {
    setTagNames(nextTags);
    updateTags.mutate(nextTags);
  };

  const addTags = (values: string[]) => {
    const next = values.map(normalizeTagName).filter(Boolean);
    if (next.length === 0) return;
    const nextTags = [...tagNames, ...next.filter((tag) => !tagNames.includes(tag))];
    setTagDraft('');
    persistTags(nextTags);
  };

  const addTag = (value: string) => addTags([value]);

  const removeTag = (tag: string) => {
    persistTags(tagNames.filter((item) => item !== tag));
  };

  const normalizedDraft = normalizeTagName(tagDraft);
  const suggestions = normalizedDraft
    ? (allTagsData?.tags ?? [])
        .filter((tag) => !tagNames.includes(tag.name) && tag.name.includes(normalizedDraft))
        .slice(0, 6)
    : [];

  if (!open) return null;

  const updatedBy =
    note.updatedByActorType === 'agent'
      ? `API key${note.updatedByActorUid ? ` (${note.updatedByActorUid})` : ''}`
      : note.updatedByActorType === 'system'
        ? 'System'
        : 'You';

  return createPortal(
    <div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--notes-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Note details</h2>
            <p className="notes-muted text-sm">Built-in metadata and tags</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
            onClick={() => onOpenChange(false)}
            aria-label="Close details dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="notes-muted self-center">Name</dt>
            <dd>
              <input
                className="w-full rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] px-2 py-1.5 outline-none focus:border-[var(--notes-blue)]"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </dd>
            <dt className="notes-muted">Folder</dt>
            <dd>{folderTitle}</dd>
            <dt className="notes-muted">Type</dt>
            <dd>{note.type === 'template' ? 'Template' : 'Note'}</dd>
            <dt className="notes-muted self-center">Created</dt>
            <dd>
              <input
                className="w-full rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] px-2 py-1.5 outline-none focus:border-[var(--notes-blue)]"
                type="datetime-local"
                value={createdAt}
                onChange={(event) => setCreatedAt(event.target.value)}
              />
            </dd>
            <dt className="notes-muted">Updated</dt>
            <dd>{formatDate(note.updatedAt)}</dd>
            <dt className="notes-muted">Updated by</dt>
            <dd>{updatedBy}</dd>
            <dt className="notes-muted self-center">API editable</dt>
            <dd>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isApiEditable}
                  onChange={(event) => setIsApiEditable(event.target.checked)}
                />{' '}
                <span>{isApiEditable ? 'Enabled' : 'Disabled'}</span>
              </label>
            </dd>
          </dl>

          <section className="space-y-2 border-t border-[var(--notes-border)] pt-5">
            <label className="block text-sm font-medium" htmlFor="note-tags-input">
              Tags
            </label>
            <div className="relative flex gap-2">
              <input
                id="note-tags-input"
                className="min-w-0 flex-1 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--notes-blue)]"
                value={tagDraft}
                onFocus={() => setTagInputFocused(true)}
                onBlur={() => window.setTimeout(() => setTagInputFocused(false), 100)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.includes(',')) {
                    const parts = value.split(',');
                    addTags(parts.slice(0, -1));
                    setTagDraft(parts.at(-1) ?? '');
                    return;
                  }
                  setTagDraft(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addTag(tagDraft);
                  } else if (event.key === 'Backspace' && !tagDraft && tagNames.length > 0) {
                    removeTag(tagNames[tagNames.length - 1]);
                  }
                }}
                placeholder="Add tag"
                disabled={isLoading || saveDetails.isPending || updateTags.isPending}
              />
              {tagDraft.trim() ? (
                <button
                  type="button"
                  className="rounded-lg border border-[var(--notes-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--notes-hover)]"
                  onClick={() => addTag(tagDraft)}
                >
                  Add
                </button>
              ) : null}
              {tagInputFocused && suggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-10 mt-1 w-full max-w-sm overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-1 text-sm shadow-lg">
                  {suggestions.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-[var(--notes-hover)]"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTag(tag.name);
                        setTagInputFocused(false);
                      }}
                    >
                      #{tag.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="notes-muted text-xs">Tags are lowercase words and may use dashes, e.g. plan or plan-type.</p>
            {tagNames.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {tagNames.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--notes-border)] bg-[var(--notes-bg)] px-2 py-1 text-xs font-medium"
                  >
                    #{tag}
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeTag(tag);
                      }}
                      aria-label={`Remove ${tag} tag`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {saveDetails.isError ? <p className="text-sm text-red-600">Unable to save details.</p> : null}

          <div className="flex justify-end gap-2 border-t border-[var(--notes-border)] pt-4">
            <button
              type="button"
              className="rounded-lg border border-[var(--notes-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--notes-hover)]"
              onClick={() => onOpenChange(false)}
            >
              Close
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--notes-blue)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saveDetails.isPending}
              onClick={() => saveDetails.mutate()}
            >
              <Save className="h-4 w-4" />
              {saveDetails.isPending ? 'Saving...' : 'Save details'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
