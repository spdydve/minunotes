import { MoreHorizontal, Settings } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const actionMenuItemClass = (destructive: boolean, className?: string) =>
  `block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--notes-hover)] ${destructive ? "text-[var(--notes-button-destructive-text)] hover:bg-[var(--notes-button-destructive-soft-hover)]" : ""} ${className ?? ""}`;

export function ActionMenuIconButton({ icon = "more", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: "more" | "settings" }) {
  const Icon = icon === "settings" ? Settings : MoreHorizontal;

  return <button
    type="button"
    className={`rounded-md p-2 transition-colors hover:bg-[var(--notes-hover)] ${className ?? ""}`}
    {...props}
  >
    <Icon className="h-4 w-4" />
  </button>;
}

export function ActionMenuButton({ children, destructive = false, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; destructive?: boolean }) {
  return <button
    type="button"
    className={actionMenuItemClass(destructive, className)}
    {...props}
  >
    {children}
  </button>;
}

export function ActionMenuItemLabel({ children, destructive = false, className, ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; destructive?: boolean }) {
  return <span
    className={actionMenuItemClass(destructive, className)}
    {...props}
  >
    {children}
  </span>;
}
