import { Outlet } from "@tanstack/react-router";
import { FolderSidebar } from "./folder-sidebar";

export function AppShell() {
  return <div className="flex min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100"><FolderSidebar /><main className="flex-1 p-6"><Outlet /></main></div>;
}
