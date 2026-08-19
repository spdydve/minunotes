import { Link } from '@tanstack/react-router';

export function SharingPageTabs({ current }: { current: 'with-me' | 'by-me' }) {
  const linkClass = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm font-medium ${
      active
        ? 'border-[var(--notes-accent)] text-[var(--notes-text)]'
        : 'border-transparent text-[var(--notes-muted)] hover:text-[var(--notes-text)]'
    }`;
  return (
    <nav aria-label="Sharing views" className="mb-6 flex gap-5 border-[var(--notes-border)] border-b">
      <Link
        to="/shared"
        className={linkClass(current === 'with-me')}
        aria-current={current === 'with-me' ? 'page' : undefined}
      >
        Shared with me
      </Link>
      <Link
        to="/shared/by-me"
        className={linkClass(current === 'by-me')}
        aria-current={current === 'by-me' ? 'page' : undefined}
      >
        Shared by me
      </Link>
    </nav>
  );
}
