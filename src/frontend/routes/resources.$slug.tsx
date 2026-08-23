import { createRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ResourceDocLayout } from '../components/resource-doc-layout';
import { getResourceDoc } from '../docs/resources';
import { setDocumentMetadata } from '../lib/document-metadata';
import { rootRoute } from './__root';

function ResourceDocView() {
  const { slug } = resourceDocRoute.useParams();
  const doc = getResourceDoc(slug);

  useEffect(
    () =>
      setDocumentMetadata(
        `${doc?.title ?? 'Resource not found'} - MinuNotes`,
        doc?.description ?? 'Browse MinuNotes product guides and integration documentation.'
      ),
    [doc?.description, doc?.title]
  );

  if (!doc) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-6 sm:p-8">
        <p className="text-[var(--notes-blue)] text-xs uppercase tracking-wide">Resource not found</p>
        <h1 className="mt-3 font-semibold text-2xl">That guide does not exist.</h1>
        <p className="mt-2 text-[var(--notes-muted)] text-sm">
          The address may have changed, or the guide may not be available yet.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/resources"
            className="rounded-md border border-[var(--notes-border)] px-3 py-2 text-sm hover:bg-[var(--notes-hover)]"
          >
            Browse Resources
          </Link>
          <Link
            to="/resources/$slug"
            params={{ slug: 'getting-started' }}
            className="rounded-md bg-[var(--notes-text)] px-3 py-2 text-[var(--notes-bg)] text-sm"
          >
            Start with Getting started
          </Link>
        </div>
      </section>
    );
  }

  return <ResourceDocLayout doc={doc} />;
}

export const resourceDocRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$slug',
  component: ResourceDocView,
});
