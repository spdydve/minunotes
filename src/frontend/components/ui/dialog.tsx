import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={`fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in ${className ?? ''}`}
      {...props}
    />
  );
}

export function DialogContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={`fixed z-50 border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-text)] shadow-2xl outline-none ${className ?? ''}`}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
