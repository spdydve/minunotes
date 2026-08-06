import { type ReactNode, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

export function DeleteConfirmDialog({
  label,
  heading,
  warning,
  actionLabel = 'Delete',
  triggerLabel,
  requiresTypedConfirmation = true,
  onConfirm,
  trigger,
  onOpenChange,
}: {
  label: string;
  heading?: string;
  warning: string;
  actionLabel?: string;
  triggerLabel?: string;
  requiresTypedConfirmation?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  trigger?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeOpen = (nextOpen: boolean) => {
    if (pending && !nextOpen) return;
    setOpen(nextOpen);
    if (!nextOpen && previousFocusRef.current) window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    setValue('');
    setError(null);
    onOpenChange?.(nextOpen);
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      changeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${actionLabel.toLowerCase()}`);
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {trigger ? (
        <button
          ref={triggerRef}
          type="button"
          className="rounded-md"
          aria-haspopup="dialog"
          onClick={(event) => {
            previousFocusRef.current = event.currentTarget;
            changeOpen(true);
          }}
        >
          {trigger}
        </button>
      ) : (
        <DialogTrigger asChild>
          <Button variant="destructive">{triggerLabel ?? actionLabel}</Button>
        </DialogTrigger>
      )}
      <DialogContent
        role="alertdialog"
        className="left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg p-4 sm:p-5"
        onCloseAutoFocus={(event) => {
          if (previousFocusRef.current) {
            event.preventDefault();
            previousFocusRef.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogTitle className="font-semibold text-lg">{heading ?? `Delete ${label}`}</DialogTitle>
        <DialogDescription className="notes-muted mt-2 text-sm">{warning}</DialogDescription>
        {requiresTypedConfirmation ? (
          <>
            <p className="mt-4 text-sm">
              Type <strong>delete</strong> to confirm.
            </p>
            <input
              className="notes-input mt-2 w-full rounded-md px-3 py-2"
              value={value}
              disabled={pending}
              aria-label={`Type delete to confirm ${label}`}
              onChange={(event) => setValue(event.target.value)}
            />
          </>
        ) : null}
        {error ? (
          <p className="mt-3 text-red-500 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={pending} onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || (requiresTypedConfirmation && value !== 'delete')}
            variant="destructive"
            onClick={() => void confirm()}
          >
            {pending ? 'Working…' : actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
