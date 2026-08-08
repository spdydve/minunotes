import { Button } from './ui/button';

export function PaginationControls({
  page,
  hasMore,
  onPageChange,
}: {
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Pagination">
      <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <span className="px-2 text-[var(--notes-muted)] text-sm">Page {page}</span>
      <Button type="button" variant="secondary" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
