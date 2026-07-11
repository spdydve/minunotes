import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="notes-empty-state rounded-lg p-8 text-center text-sm">
      {title ? <h2 className="text-lg font-semibold text-[var(--notes-text)]">{title}</h2> : null}
      <div className={title ? 'mt-2' : ''}>{children}</div>
    </div>
  );
}
