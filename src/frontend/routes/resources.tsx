import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { resourceDocs } from "../docs/resources";

function ResourcesView() {
  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/" className="text-xs text-[var(--notes-muted)] hover:text-[var(--notes-text)]">← Back to notes</Link>
          <h1 className="mt-2 text-2xl font-semibold">Resources</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--notes-muted)]">
            Guides, API references, and integration docs for MinuNotes agents and developer tools.
          </p>
        </div>
        <Link
          to="/settings/api-access"
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--notes-border)] bg-[var(--notes-button-secondary-bg)] px-3 text-sm text-[var(--notes-button-secondary-text)] hover:bg-[var(--notes-button-secondary-hover)]"
        >
          Manage API keys
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {resourceDocs.map((doc) => (
          <Link
            key={doc.slug}
            to="/resources/$slug"
            params={{ slug: doc.slug }}
            className="group rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-5 transition-colors hover:bg-[var(--notes-hover)]"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--notes-muted)]">{doc.category}</p>
            <h2 className="mt-3 text-lg font-semibold text-[var(--notes-text)]">{doc.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--notes-muted)]">{doc.description}</p>
            <span className="mt-4 inline-block text-sm text-[var(--notes-blue)] group-hover:underline">Read guide →</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-4 text-sm text-[var(--notes-muted)]">
        Quick endpoints: <code className="rounded bg-[var(--notes-code-bg)] px-1.5 py-0.5 text-[var(--notes-text)]">/api/openapi.json</code>{" "}
        <code className="rounded bg-[var(--notes-code-bg)] px-1.5 py-0.5 text-[var(--notes-text)]">/api/mcp</code>{" "}
        <code className="rounded bg-[var(--notes-code-bg)] px-1.5 py-0.5 text-[var(--notes-text)]">/api/harness/*</code>
      </div>
    </section>
  );
}

export const resourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/resources",
  component: ResourcesView,
});
