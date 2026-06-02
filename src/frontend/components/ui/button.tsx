import type { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] px-3 py-2 text-sm hover:bg-[var(--notes-hover)] disabled:opacity-50 ${props.className ?? ""}`} />;
}
