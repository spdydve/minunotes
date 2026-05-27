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
        <Link
          className="font-medium text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300"
          to="/notes/$noteId"
          params={{ noteId: info.row.original.id }}
        >
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: "Updated",
      cell: (info) => (
        <span className="text-xs text-slate-500">
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
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  className="border-b border-slate-200 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800"
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
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  className="border-b border-slate-100 px-4 py-3 align-middle last:text-right dark:border-slate-900"
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
