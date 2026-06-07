import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { NotesTable } from "../components/notes-table";
import { rootRoute } from "./__root";

function TemplatesView() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.templates().then((result) => result.templates),
  });
  const create = useMutation({
    mutationFn: async () => {
      const folder = folders.data?.folders[0] ?? (await api.folders()).folders[0];
      if (!folder) throw new Error("Create a folder before creating templates.");
      return api.createNote(folder.id, { title: "Untitled template", type: "template" });
    },
    onSuccess: ({ note }) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["notes", note.folderId, "template"] });
      nav({ to: "/notes/$noteId", params: { noteId: note.id } });
    },
  });

  if (folders.isLoading || templates.isLoading) return <p className="notes-muted text-sm">Loading templates...</p>;
  if (!folders.data?.folders.length) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Create a folder first"><p>Templates are markdown notes and need a workspace folder before they can be created.</p><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Templates</h2>
          <p className="notes-muted mt-1 text-sm">Reusable markdown notes for creating new notes.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>New template</Button>
      </div>
      {create.error ? <p className="mb-4 text-sm text-red-500">{create.error instanceof Error ? create.error.message : "Unable to create template"}</p> : null}
      {templates.data?.length ? <NotesTable notes={templates.data} queryKey={["templates"]} /> : <EmptyState title="No templates yet"><p>Create your first template to reuse note structure and content.</p></EmptyState>}
    </section>
  );
}

export const templatesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/templates", component: TemplatesView });
