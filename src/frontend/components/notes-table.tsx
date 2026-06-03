import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { api, type Note } from "../lib/api";
import { NoteActionsPopover } from "./note-actions-popover";

const columnHelper = createColumnHelper<Note>();

export function NotesTable({ notes }: { notes: Note[] }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: ({ noteId }: { noteId: string }) => api.deleteNote(noteId),
    onSuccess: (_, variables) => {
      const note = notes.find((item) => item.id === variables.noteId);
      if (!note) return;
      qc.invalidateQueries({ queryKey: ["notes", note.folderId] });
      qc.invalidateQueries({ queryKey: ["note", note.id] });
    },
  });

  const columns = [
    columnHelper.accessor("title", {
      header: "Title",
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Link
            className="font-medium text-[var(--notes-text)] transition-colors hover:text-[var(--notes-blue)]"
            to="/notes/$noteId"
            params={{ noteId: info.row.original.id }}
          >
            {info.getValue()}
          </Link>
          {info.row.original.updatedByActorType === "agent" ? <span className="rounded border border-[var(--notes-blue)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--notes-blue)]">API</span> : null}
        </div>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: "Updated",
      cell: (info) => (
        <span className="text-xs text-[var(--notes-muted)]">
          {new Date(info.getValue()).toLocaleString()}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
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

  const table = useReactTable({
    data: notes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
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
                  className="border-b border-[var(--notes-table-row-border)] px-4 py-3 align-middle last:text-right first:pl-5 last:pr-5"
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
  );
}
