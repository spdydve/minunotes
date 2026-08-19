import { X } from 'lucide-react';
import { ThemeSelect } from './theme-select';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export function ThemeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-1/2 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="font-semibold text-lg">Theme</DialogTitle>
            <DialogDescription className="mt-1 text-[var(--notes-muted)] text-sm">
              Choose the appearance used throughout MinuNotes.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button type="button" className="rounded-md p-1.5 hover:bg-[var(--notes-hover)]" aria-label="Close theme">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>
        <div className="mt-5">
          <ThemeSelect />
        </div>
      </DialogContent>
    </Dialog>
  );
}
