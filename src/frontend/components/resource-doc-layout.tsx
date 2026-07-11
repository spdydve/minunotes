import { Link } from '@tanstack/react-router';
import type { ResourceDoc } from '../docs/resources';

export function ResourceDocLayout({ doc }: { doc: ResourceDoc }) {
  const Doc = doc.component;

  return (
    <section className="mx-auto w-full max-w-4xl">
      <Link to="/resources" className="text-xs text-[var(--notes-muted)] hover:text-[var(--notes-text)]">
        ← Resources
      </Link>
      <article className="notes-mdx mt-4 min-w-0 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] px-5 py-6 sm:px-8">
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--notes-muted)]">{doc.category}</p>
        <Doc />
      </article>
    </section>
  );
}
