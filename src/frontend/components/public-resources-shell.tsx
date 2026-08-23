import { Link, Outlet } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { useEffect } from 'react';
import { applyNoteTheme, getStoredTheme } from '../lib/themes';

export function PublicResourcesShell() {
  useEffect(() => {
    applyNoteTheme(getStoredTheme());
  }, []);

  return (
    <div className="min-h-screen bg-[var(--notes-bg)] text-[var(--notes-text)]">
      <header className="sticky top-0 z-30 border-[var(--notes-border)] border-b bg-[var(--notes-bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Link to="/resources" className="flex items-center gap-2 font-mono font-semibold tracking-tight">
              <BookOpen className="h-4 w-4 text-[var(--notes-blue)]" aria-hidden="true" />
              MinuNotes
            </Link>
            <Link
              to="/resources"
              className="hidden text-[var(--notes-muted)] text-sm hover:text-[var(--notes-text)] sm:inline"
            >
              Resources
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="rounded-md border border-[var(--notes-border)] px-3 py-1.5 text-sm hover:bg-[var(--notes-hover)]"
            >
              Sign in
            </Link>
            <Link
              to="/"
              className="hidden rounded-md bg-[var(--notes-text)] px-3 py-1.5 text-[var(--notes-bg)] text-sm sm:inline-block"
            >
              Open MinuNotes
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-[var(--notes-border)] border-t px-4 py-6 text-center text-[var(--notes-muted)] text-xs">
        MinuNotes by Minuscule Labs
      </footer>
    </div>
  );
}
