import { createRoute, Link } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Bot, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import {
  getResourceDocsForSection,
  type ResourceDoc,
  type ResourceSectionId,
  resourceDocs,
  resourceSections,
} from '../docs/resources';
import { setDocumentMetadata } from '../lib/document-metadata';
import { rootRoute } from './__root';

const userSectionIds: ResourceSectionId[] = ['write', 'organize', 'collaborate', 'recover'];

function ResourceCard({ doc }: { doc: ResourceDoc }) {
  return (
    <Link
      to="/resources/$slug"
      params={{ slug: doc.slug }}
      className="group flex h-full flex-col rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-5 transition-colors hover:bg-[var(--notes-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-[var(--notes-text)]">{doc.title}</h3>
        {doc.advanced ? (
          <span className="rounded border border-[var(--notes-border)] px-1.5 py-0.5 text-[10px] text-[var(--notes-muted)] uppercase tracking-wide">
            Advanced
          </span>
        ) : null}
      </div>
      <p className="mt-2 flex-1 text-[var(--notes-muted)] text-sm leading-6">{doc.description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[var(--notes-blue)] text-sm">
        Read guide{' '}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ResourceSection({ sectionId }: { sectionId: ResourceSectionId }) {
  const section = resourceSections.find((item) => item.id === sectionId);
  const docs = getResourceDocsForSection(sectionId);
  if (!section || docs.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby={`resources-${section.id}`}>
      <div className="mb-4">
        <h2 id={`resources-${section.id}`} className="font-semibold text-xl">
          {section.title}
        </h2>
        <p className="mt-1 text-[var(--notes-muted)] text-sm">{section.description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => (
          <ResourceCard key={doc.slug} doc={doc} />
        ))}
      </div>
    </section>
  );
}

function ResourcesView() {
  const gettingStarted = resourceDocs.find((doc) => doc.featured);

  useEffect(
    () =>
      setDocumentMetadata(
        'MinuNotes Resources',
        'Learn how to write, organize, share, recover, and connect your work with MinuNotes.'
      ),
    []
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <section className="grid gap-6 border-[var(--notes-border)] border-b pb-10 lg:grid-cols-[1fr_0.9fr] lg:items-end">
        <div>
          <p className="font-medium text-[var(--notes-blue)] text-xs uppercase tracking-[0.18em]">
            MinuNotes Resources
          </p>
          <h1 className="mt-3 max-w-3xl font-semibold text-3xl tracking-tight sm:text-4xl">
            Learn to build a calmer, connected workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-[var(--notes-muted)] leading-7">
            Practical guides for writing, organizing, collaborating, and connecting trusted agents to your notes.
          </p>
        </div>
        <div className="flex gap-3 text-[var(--notes-muted)] text-xs lg:justify-end">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> Product guides
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bot className="h-4 w-4" /> Integration docs
          </span>
        </div>
      </section>

      {gettingStarted ? (
        <section className="mt-8" aria-labelledby="start-here-heading">
          <Link
            to="/resources/$slug"
            params={{ slug: gettingStarted.slug }}
            className="group grid gap-5 rounded-lg border border-[var(--notes-blue)]/40 bg-[color-mix(in_srgb,var(--notes-blue)_7%,var(--notes-panel))] p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--notes-blue)] text-white">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span id="start-here-heading" className="block font-semibold text-lg">
                Start with Getting started
              </span>
              <span className="mt-1 block text-[var(--notes-muted)] text-sm leading-6">
                {gettingStarted.description}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--notes-blue)] text-sm">
              Start guide <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </section>
      ) : null}

      <div className="mt-12 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-[var(--notes-blue)]" aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-2xl">Learn MinuNotes</h2>
          <p className="text-[var(--notes-muted)] text-sm">Task-focused guidance for your everyday workspace.</p>
        </div>
      </div>
      {userSectionIds.map((sectionId) => (
        <ResourceSection key={sectionId} sectionId={sectionId} />
      ))}

      <div className="mt-16 border-[var(--notes-border)] border-t pt-10">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-[var(--notes-blue)]" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-2xl">Build with MinuNotes</h2>
            <p className="text-[var(--notes-muted)] text-sm">Agent, API, MCP, and integration documentation.</p>
          </div>
        </div>
        <ResourceSection sectionId="integrate" />
      </div>
    </div>
  );
}

export const resourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources',
  component: ResourcesView,
});
