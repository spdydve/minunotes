import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'secondary' | 'destructive' | 'base';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  secondary:
    'border-[var(--notes-button-secondary-border)] bg-[var(--notes-button-secondary-bg)] text-[var(--notes-button-secondary-text)] hover:bg-[var(--notes-button-secondary-hover)]',
  destructive:
    'border-[var(--notes-button-destructive-border)] bg-[var(--notes-button-destructive-bg)] text-[var(--notes-button-destructive-text)] hover:bg-[var(--notes-button-destructive-hover)]',
  base: 'border-slate-300 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200',
};

export function Button({ className, variant = 'secondary', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className ?? ''}`}
    />
  );
}
