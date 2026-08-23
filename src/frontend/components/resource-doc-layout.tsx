import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  getAdjacentResourceDocs,
  getResourceDoc,
  getResourceDocsForSection,
  getResourceSection,
  type ResourceDoc,
  resourceSections,
} from '../docs/resources';

function ResourceNavigation({ currentSlug }: { currentSlug: string }) {
  return (
    <nav aria-label="Resource guides" className="space-y-5">
      {resourceSections.map((section) => {
        const docs = getResourceDocsForSection(section.id);
        if (docs.length === 0) return null;
        return (
          <div key={section.id}>
            <p className="mb-1.5 font-medium text-[var(--notes-muted)] text-[11px] uppercase tracking-wide">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {docs.map((item) => (
                <Link
                  key={item.slug}
                  to="/resources/$slug"
                  params={{ slug: item.slug }}
                  aria-current={item.slug === currentSlug ? 'page' : undefined}
                  className={`block rounded-md px-2 py-1.5 text-sm ${
                    item.slug === currentSlug
                      ? 'bg-[var(--notes-hover)] font-medium text-[var(--notes-text)]'
                      : 'text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]'
                  }`}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function ResourceDocLayout({ doc }: { doc: ResourceDoc }) {
  const Doc = doc.component;
  const section = getResourceSection(doc.section);
  const related = (doc.relatedSlugs ?? []).map(getResourceDoc).filter((item) => item !== undefined);
  const adjacent = getAdjacentResourceDocs(doc.slug);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        to="/resources"
        className="inline-flex items-center gap-1 text-[var(--notes-muted)] text-sm hover:text-[var(--notes-text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Resources
      </Link>

      <details className="mt-5 rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] p-3 lg:hidden">
        <summary className="cursor-pointer font-medium text-sm">Browse guides</summary>
        <div className="mt-4 border-[var(--notes-border)] border-t pt-4">
          <ResourceNavigation currentSlug={doc.slug} />
        </div>
      </details>

      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pr-3 lg:block">
          <ResourceNavigation currentSlug={doc.slug} />
        </aside>

        <main className="min-w-0">
          <article className="notes-mdx min-w-0 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] px-5 py-6 sm:px-8 sm:py-8">
            <p className="mb-2 text-[var(--notes-blue)] text-xs uppercase tracking-wide">
              {section?.title ?? 'Resources'} {doc.advanced ? '· Advanced' : ''}
            </p>
            <Doc />
          </article>

          {related.length > 0 ? (
            <section className="mt-6" aria-labelledby="related-guides-heading">
              <h2 id="related-guides-heading" className="font-semibold text-sm uppercase tracking-wide">
                Related guides
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <Link
                    key={item.slug}
                    to="/resources/$slug"
                    params={{ slug: item.slug }}
                    className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4 hover:bg-[var(--notes-hover)]"
                  >
                    <span className="block font-medium text-sm">{item.title}</span>
                    <span className="mt-1 block text-[var(--notes-muted)] text-xs leading-5">{item.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <nav
            aria-label="Previous and next guides"
            className="mt-8 grid gap-3 border-[var(--notes-border)] border-t pt-6 sm:grid-cols-2"
          >
            <div>
              {adjacent.previous ? (
                <Link
                  to="/resources/$slug"
                  params={{ slug: adjacent.previous.slug }}
                  className="inline-flex items-center gap-2 text-[var(--notes-muted)] text-sm hover:text-[var(--notes-text)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>
                    <span className="block text-[10px] uppercase">Previous</span>
                    {adjacent.previous.title}
                  </span>
                </Link>
              ) : null}
            </div>
            <div className="sm:text-right">
              {adjacent.next ? (
                <Link
                  to="/resources/$slug"
                  params={{ slug: adjacent.next.slug }}
                  className="inline-flex items-center gap-2 text-[var(--notes-muted)] text-sm hover:text-[var(--notes-text)]"
                >
                  <span>
                    <span className="block text-[10px] uppercase">Next</span>
                    {adjacent.next.title}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </nav>
        </main>
      </div>
    </div>
  );
}
