import { Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { FolderSidebar } from "./folder-sidebar";
import { authClient } from "../lib/auth-client";

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = authClient.useSession();
  const isAuthRoute = pathname === "/auth";

  if (isAuthRoute) return <Outlet />;
  if (session.isPending) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950">Loading...</div>;
  if (!session.data?.user) return <Navigate to="/auth" />;

  return <div className="flex min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100"><FolderSidebar userEmail={session.data.user.email} /><main className="min-w-0 flex-1 px-0 py-6"><Outlet /></main></div>;
}
