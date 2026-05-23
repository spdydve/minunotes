import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import type { Note } from "../lib/api";
import { MoveNoteDialog } from "./move-note-dialog";

const columnHelper = createColumnHelper<Note>();

export function NotesTable({ notes }: { notes: Note[] }) {
  const columns = [
    columnHelper.accessor("title", { header: "Title", cell: (info) => <Link className="underline" to="/notes/$noteId" params={{ noteId: info.row.original.id }}>{info.getValue()}</Link> }),
    columnHelper.accessor("updatedAt", { header: "Updated" }),
    columnHelper.display({ id: "actions", header: "Actions", cell: (info) => <MoveNoteDialog note={info.row.original} /> }),
  ];
  const table = useReactTable({ data: notes, columns, getCoreRowModel: getCoreRowModel() });
  return <table className="w-full border-collapse text-sm"><thead>{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th className="border-b p-3 text-left" key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td className="border-b p-3" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>;
}
