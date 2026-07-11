import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { api, type Note } from '../lib/api';
import { NoteActionsPopover } from './note-actions-popover';

const columnHelper = createColumnHelper<Note>();

export function NotesTable({ notes, queryKey }: { notes: Note[]; queryKey?: unknown[] }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: ({ noteId }: { noteId: string }) => api.deleteNote(noteId),
    onSuccess: (_, variables) => {
      const note = notes.find((item) => item.id === variables.noteId);
      if (!note) return;
      qc.invalidateQueries({ queryKey: queryKey ?? ['notes', note.folderId] });
      qc.invalidateQueries({ queryKey: ['note', note.id] });
    },
  });

  const columns = [
    columnHelper.accessor('title', {
      header: 'Title',
      cell: (info) => (
        <Link
          className="font-medium text-[var(--notes-text)] transition-colors hover:text-[var(--notes-blue)]"
          to="/notes/$noteId"
          params={{ noteId: info.row.original.id }}
        >
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => (
        <span className="text-xs text-[var(--notes-muted)]">{new Date(info.getValue()).toLocaleString()}</span>
      ),
    }),
    columnHelper.accessor('updatedAt', {
      header: 'Updated',
      cell: (info) => (
        <span className="text-xs text-[var(--notes-muted)]">{new Date(info.getValue()).toLocaleString()}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => (
        <div className="flex justify-end">
          <NoteActionsPopover
            note={info.row.original}
            onDelete={() => remove.mutate({ noteId: info.row.original.id })}
          />
        </div>
      ),
    }),
  ];

  const sortedNotes = [...notes].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return updatedDiff || a.title.localeCompare(b.title);
  });

  const table = useReactTable({
    data: sortedNotes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <div className="space-y-2 md:hidden">
        {sortedNotes.map((note) => (
          <div key={note.id} className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  className="truncate font-medium hover:text-[var(--notes-blue)]"
                  to="/notes/$noteId"
                  params={{ noteId: note.id }}
                >
                  {note.title}
                </Link>
                <p className="mt-1 text-xs text-[var(--notes-muted)]">
                  Created {new Date(note.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[var(--notes-muted)]">
                  Updated {new Date(note.updatedAt).toLocaleString()}
                </p>
              </div>
              <NoteActionsPopover note={note} onDelete={() => remove.mutate({ noteId: note.id })} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--notes-table-header-bg)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    className="border-b border-[var(--notes-border)] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)] first:pl-5 last:pr-5"
                    key={h.id}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-[var(--notes-table-row-hover)]">
                {row.getVisibleCells().map((cell) => (
                  <td
                    className="border-b border-[var(--notes-table-row-border)] px-4 py-3 align-middle first:pl-5 last:pr-5 last:text-right"
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
