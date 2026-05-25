import { MoreHorizontal, Settings } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function ActionMenuIconButton({ icon = "more", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: "more" | "settings" }) {
  const Icon = icon === "settings" ? Settings : MoreHorizontal;

  return <button
    type="button"
    className={`rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-900 ${className ?? ""}`}
    {...props}
  >
    <Icon className="h-4 w-4" />
  </button>;
}

export function ActionMenuButton({ children, destructive = false, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; destructive?: boolean }) {
  return <button
    type="button"
    className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900 ${destructive ? "text-red-700 dark:text-red-400" : ""} ${className ?? ""}`}
    {...props}
  >
    {children}
  </button>;
}

export function ActionMenuItemLabel({ children, destructive = false, className, ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; destructive?: boolean }) {
  return <span
    className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900 ${destructive ? "text-red-700 dark:text-red-400" : ""} ${className ?? ""}`}
    {...props}
  >
    {children}
  </span>;
}
