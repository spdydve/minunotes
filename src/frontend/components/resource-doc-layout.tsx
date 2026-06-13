import { Link } from "@tanstack/react-router";
import { resourceDocs, type ResourceDoc } from "../docs/resources";

export function ResourceDocLayout({ doc }: { doc: ResourceDoc }) {
  const Doc = doc.component;

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Link to="/resources" className="text-xs text-[var(--notes-muted)] hover:text-[var(--notes-text)]">← Resources</Link>
        <nav className="mt-4 overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-2">
          {resourceDocs.map((item) => (
            <Link
              key={item.slug}
              to="/resources/$slug"
              params={{ slug: item.slug }}
              className={`block rounded-md px-3 py-2 text-sm hover:bg-[var(--notes-hover)] ${item.slug === doc.slug ? "bg-[var(--notes-hover)] text-[var(--notes-text)]" : "text-[var(--notes-muted)]"}`}
            >
              {item.title}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="notes-mdx min-w-0 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] px-5 py-6 sm:px-8">
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--notes-muted)]">{doc.category}</p>
        <Doc />
      </article>
    </section>
  );
}
