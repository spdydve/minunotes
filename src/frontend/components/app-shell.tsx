import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { buildAppNavigationModel, noteIdFromNavigationPath } from '../lib/navigation';
import { getStoredSidebarCollapsed, storeSidebarCollapsed } from '../lib/navigation-preferences';
import { applyNoteTheme, getStoredTheme } from '../lib/themes';
import { AppNavigationBar } from './app-navigation-bar';
import { FolderSidebar } from './folder-sidebar';
import { SearchDialog } from './search-dialog';

export function AppShell() {
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const session = authClient.useSession();
  const isAuthRoute = pathname === '/auth';
  const isPublicShareRoute = pathname.startsWith('/share/');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(getStoredSidebarCollapsed);
  const navigationNoteId = noteIdFromNavigationPath(pathname);
  const navigationEnabled = Boolean(session.data?.user && !isAuthRoute && !isPublicShareRoute);
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders, enabled: navigationEnabled });
  const navigationNote = useQuery({
    queryKey: ['note', navigationNoteId],
    queryFn: () => {
      if (!navigationNoteId) throw new Error('Navigation note ID is required');
      return api.note(navigationNoteId);
    },
    enabled: navigationEnabled && Boolean(navigationNoteId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const navigation = useMemo(
    () =>
      buildAppNavigationModel({
        pathname,
        folders: folders.data?.folders ?? [],
        note: navigationNote.data?.note ?? null,
      }),
    [pathname, folders.data?.folders, navigationNote.data?.note]
  );

  useEffect(() => {
    applyNoteTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (isPublicShareRoute) return;
    const pageTitle =
      pathname === '/auth'
        ? 'Sign in'
        : pathname === '/oauth/authorize'
          ? 'Authorize application'
          : /\/notes\/[^/]+\/activity\/?$/.test(pathname) && navigationNote.data?.note
            ? `${navigationNote.data.note.title} activity`
            : navigation.mobileTitle;
    document.title = `${pageTitle} - MinuNotes`;
  }, [isPublicShareRoute, navigation.mobileTitle, navigationNote.data?.note, pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    storeSidebarCollapsed(desktopSidebarCollapsed);
  }, [desktopSidebarCollapsed]);

  if (isAuthRoute || isPublicShareRoute) return <Outlet />;
  if (session.isPending)
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">
        Loading...
      </div>
    );
  if (!session.data?.user) {
    const redirect = `${location.pathname}${location.searchStr}`;
    return <Navigate to="/auth" search={redirect === '/' ? undefined : { redirect }} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--notes-bg)] text-[var(--notes-text)]">
      <SearchDialog />
      {desktopSidebarCollapsed ? null : (
        <div className="hidden md:block">
          <FolderSidebar
            userEmail={session.data.user.email}
            navigation={navigation}
            onCollapse={() => setDesktopSidebarCollapsed(true)}
          />
        </div>
      )}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Dismiss menu"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative h-full w-[min(20rem,86vw)]">
            <FolderSidebar
              userEmail={session.data.user.email}
              navigation={navigation}
              onNavigate={() => setSidebarOpen(false)}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {desktopSidebarCollapsed ? (
          <button
            className="fixed left-4 top-[5px] z-40 hidden rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2 text-[var(--notes-muted)] shadow-sm hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)] md:block"
            type="button"
            aria-label="Expand sidebar"
            onClick={() => setDesktopSidebarCollapsed(false)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : null}
        <AppNavigationBar
          navigation={navigation}
          onOpenMenu={() => setSidebarOpen(true)}
          sidebarCollapsed={desktopSidebarCollapsed}
        />
        <main
          className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 ${desktopSidebarCollapsed ? 'md:pl-20' : ''}`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
