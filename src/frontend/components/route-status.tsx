import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--notes-bg)] px-4 text-[var(--notes-text)]">
      {children}
    </main>
  );
}

export function RouteNotFound() {
  useEffect(() => {
    document.title = 'Page not found - MinuNotes';
  }, []);

  return (
    <StatusShell>
      <EmptyState title="Page not found">
        <p>The page you requested does not exist.</p>
        <Link
          to="/"
          className="mt-4 inline-flex rounded-md border border-[var(--notes-button-secondary-border)] bg-[var(--notes-button-secondary-bg)] px-3 py-2 text-sm text-[var(--notes-button-secondary-text)] hover:bg-[var(--notes-button-secondary-hover)]"
        >
          Go to Home
        </Link>
      </EmptyState>
    </StatusShell>
  );
}

export function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    document.title = 'Unable to load page - MinuNotes';
  }, []);
  const message = import.meta.env.DEV && error.message ? error.message : 'An unexpected error interrupted this page.';

  return (
    <StatusShell>
      <EmptyState title="Unable to load page">
        <p>{message}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link
            to="/"
            className="inline-flex rounded-md border border-[var(--notes-button-secondary-border)] bg-[var(--notes-button-secondary-bg)] px-3 py-2 text-sm text-[var(--notes-button-secondary-text)] hover:bg-[var(--notes-button-secondary-hover)]"
          >
            Go to Home
          </Link>
        </div>
      </EmptyState>
    </StatusShell>
  );
}
