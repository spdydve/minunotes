import { Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { FolderSidebar } from "./folder-sidebar";
import { authClient } from "../lib/auth-client";
import { applyNoteTheme, getStoredTheme } from "../lib/themes";

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = authClient.useSession();
  const isAuthRoute = pathname === "/auth";

  useEffect(() => {
    applyNoteTheme(getStoredTheme());
  }, []);

  if (isAuthRoute) return <Outlet />;
  if (session.isPending) return <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">Loading...</div>;
  if (!session.data?.user) return <Navigate to="/auth" />;

  return <div className="flex h-screen overflow-hidden bg-[var(--notes-bg)] text-[var(--notes-text)]"><FolderSidebar userEmail={session.data.user.email} /><main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-6"><Outlet /></main></div>;
}
