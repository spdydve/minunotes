import { Link } from '@tanstack/react-router';
import { ArrowUpLeft, ChevronRight, Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppNavigationModel, NavigationDestination } from '../lib/navigation';

function DestinationLink({
  destination,
  className,
  children,
  ariaLabel,
}: {
  destination: NavigationDestination;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const common = { className, 'aria-label': ariaLabel, title: ariaLabel };
  switch (destination.kind) {
    case 'home':
      return (
        <Link to="/" {...common}>
          {children}
        </Link>
      );
    case 'folder':
      return (
        <Link to="/folders/$folderId" params={{ folderId: destination.folderId }} {...common}>
          {children}
        </Link>
      );
    case 'note':
      return (
        <Link to="/notes/$noteId" params={{ noteId: destination.noteId }} {...common}>
          {children}
        </Link>
      );
    case 'templates':
      return (
        <Link to="/templates" {...common}>
          {children}
        </Link>
      );
    case 'trash':
      return (
        <Link to="/trash" {...common}>
          {children}
        </Link>
      );
    case 'folder-settings':
      return (
        <Link to="/folders/$folderId/settings" params={{ folderId: destination.folderId }} {...common}>
          {children}
        </Link>
      );
    case 'folder-template':
      return (
        <Link to="/folders/$folderId/new-from-template" params={{ folderId: destination.folderId }} {...common}>
          {children}
        </Link>
      );
    case 'api-access':
      return (
        <Link to="/settings/api-access" {...common}>
          {children}
        </Link>
      );
    case 'resources':
      return (
        <Link to="/resources" {...common}>
          {children}
        </Link>
      );
    case 'resource':
      return (
        <Link to="/resources/$slug" params={{ slug: destination.slug }} {...common}>
          {children}
        </Link>
      );
  }
}

export function AppNavigationBar({
  navigation,
  onOpenMenu,
  sidebarCollapsed,
}: {
  navigation: AppNavigationModel;
  onOpenMenu: () => void;
  sidebarCollapsed: boolean;
}) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-[var(--notes-border)] border-b bg-[var(--notes-panel-muted)] px-4 md:hidden">
        <button
          type="button"
          className="rounded-md border border-[var(--notes-border)] p-2"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-3 text-center text-sm font-semibold" title={navigation.mobileTitle}>
          {navigation.mobileTitle}
        </h1>
        {navigation.parent ? (
          <DestinationLink
            destination={navigation.parent.destination}
            className="rounded-md border border-[var(--notes-border)] p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
            ariaLabel={`Go to ${navigation.parent.label}`}
          >
            <ArrowUpLeft className="h-4 w-4" />
          </DestinationLink>
        ) : (
          <span className="w-9" />
        )}
      </header>

      <nav
        aria-label="Breadcrumb"
        className={`hidden h-11 shrink-0 items-center overflow-x-auto border-[var(--notes-border)] border-b bg-[var(--notes-bg)] pr-6 text-xs md:flex ${sidebarCollapsed ? 'pl-20' : 'pl-6'}`}
      >
        <ol className="flex w-max min-w-full items-center gap-1 whitespace-nowrap">
          {navigation.breadcrumbs.map((item, index) => {
            const isCurrent = index === navigation.breadcrumbs.length - 1;
            return (
              <li key={`${item.destination.kind}-${item.label}`} className="flex min-w-0 shrink-0 items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--notes-muted)]" /> : null}
                {isCurrent ? (
                  <span
                    className="max-w-64 truncate font-medium text-[var(--notes-text)]"
                    aria-current="page"
                    title={item.label}
                  >
                    {item.label}
                  </span>
                ) : (
                  <DestinationLink
                    destination={item.destination}
                    className="max-w-48 truncate rounded px-1.5 py-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
                    ariaLabel={item.label}
                  >
                    {item.label}
                  </DestinationLink>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
