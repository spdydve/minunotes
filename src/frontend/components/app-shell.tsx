import { Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FolderSidebar } from "./folder-sidebar";
import { authClient } from "../lib/auth-client";
import { applyNoteTheme, getStoredTheme } from "../lib/themes";

export function AppShell() {
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const session = authClient.useSession();
  const isAuthRoute = pathname === "/auth";
  const isPublicShareRoute = pathname.startsWith("/share/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    applyNoteTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isAuthRoute || isPublicShareRoute) return <Outlet />;
  if (session.isPending) return <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">Loading...</div>;
  if (!session.data?.user) {
    const redirect = `${location.pathname}${location.searchStr}`;
    return <Navigate to="/auth" search={redirect === "/" ? undefined : { redirect }} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--notes-bg)] text-[var(--notes-text)]">
      {desktopSidebarCollapsed ? null : (
        <div className="hidden md:block">
          <FolderSidebar userEmail={session.data.user.email} onCollapse={() => setDesktopSidebarCollapsed(true)} />
        </div>
      )}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />
          <div className="relative h-full w-[min(20rem,86vw)]">
            <FolderSidebar userEmail={session.data.user.email} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {desktopSidebarCollapsed ? (
          <button className="fixed left-4 top-4 z-40 hidden rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2 text-[var(--notes-muted)] shadow-sm hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)] md:block" type="button" aria-label="Expand sidebar" onClick={() => setDesktopSidebarCollapsed(false)}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : null}
        <header className="flex h-14 items-center justify-between border-b border-[var(--notes-border)] bg-[var(--notes-panel-muted)] px-4 md:hidden">
          <button className="rounded-md border border-[var(--notes-border)] p-2" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <h1 className="text-sm font-semibold">Notes</h1>
          <span className="w-9" />
        </header>
        <main className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 ${desktopSidebarCollapsed ? "md:pl-20" : ""}`}><Outlet /></main>
      </div>
    </div>
  );
}
