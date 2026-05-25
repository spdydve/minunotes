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
    columnHelper.accessor("title", { header: "Title", cell: (info) => <Link className="underline" to="/notes/$noteId" params={{ noteId: info.row.original.id }}>{info.getValue()}</Link> }),
    columnHelper.accessor("updatedAt", { header: "Updated" }),
    columnHelper.display({ id: "actions", header: "Actions", cell: (info) => <NoteActionsPopover note={info.row.original} onDelete={() => remove.mutate({ noteId: info.row.original.id })} /> }),
  ];
  const table = useReactTable({ data: notes, columns, getCoreRowModel: getCoreRowModel() });
  return <table className="w-full border-collapse text-sm"><thead>{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th className="border-b p-3 text-left" key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td className="border-b p-3" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>;
}
