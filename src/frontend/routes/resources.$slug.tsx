import { createRoute, Link } from "@tanstack/react-router";
import { ResourceDocLayout } from "../components/resource-doc-layout";
import { getResourceDoc } from "../docs/resources";
import { rootRoute } from "./__root";

function ResourceDocView() {
  const { slug } = resourceDocRoute.useParams();
  const doc = getResourceDoc(slug);

  if (!doc) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-6">
        <Link to="/resources" className="text-xs text-[var(--notes-muted)] hover:text-[var(--notes-text)]">← Resources</Link>
        <h1 className="mt-4 text-2xl font-semibold">Resource not found</h1>
        <p className="mt-2 text-sm text-[var(--notes-muted)]">This documentation page does not exist yet.</p>
      </section>
    );
  }

  return <ResourceDocLayout doc={doc} />;
}

export const resourceDocRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/resources/$slug",
  component: ResourceDocView,
});
