import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "../components/ui/empty-state";
import { NotesTable } from "../components/notes-table";
import { api } from "../lib/api";
import { rootRoute } from "./__root";

function Index() {
  const { data, isLoading } = useQuery({ queryKey: ["notes", "recent"], queryFn: () => api.recentNotes(10) });

  if (isLoading) return <p className="notes-muted text-sm">Loading recent notes...</p>;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Recent notes</h2>
        <p className="notes-muted mt-1 text-sm">Your latest notes across all folders.</p>
      </div>
      {data?.notes.length ? <NotesTable notes={data.notes} queryKey={["notes", "recent"]} /> : <EmptyState>Create or select a folder to begin.</EmptyState>}
    </section>
  );
}

export const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Index });
