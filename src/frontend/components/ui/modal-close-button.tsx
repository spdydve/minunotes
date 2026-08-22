import { X } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

export function ModalCloseButton({
  label,
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> & {
  label: string;
}) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
