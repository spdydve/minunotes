import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export function AccountProfileDialog({
  email,
  open,
  onOpenChange,
}: {
  email?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const profile = useQuery({ queryKey: ['account-profile'], queryFn: api.accountProfile });
  const accountEmail = profile.data?.profile.email ?? email ?? 'Email unavailable';

  useEffect(() => {
    if (open && profile.data) setDisplayName(profile.data.profile.identity.displayName ?? '');
  }, [open, profile.data]);

  const updateProfile = useMutation({
    mutationFn: async (name: string) => {
      const result = await authClient.updateUser({ name });
      if (result.error) throw new Error(result.error.message ?? 'Unable to update profile');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account-profile'] });
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateProfile.mutate(displayName);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="font-semibold text-lg">Profile</DialogTitle>
            <DialogDescription className="mt-1 text-[var(--notes-muted)] text-sm">
              Choose how collaborators see you. Display names are optional and do not need to be unique.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button type="button" className="rounded-md p-1.5 hover:bg-[var(--notes-hover)]" aria-label="Close profile">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block text-sm" htmlFor="profile-display-name">
            <span className="mb-1 block font-medium">Display name</span>
            <input
              id="profile-display-name"
              value={displayName}
              maxLength={120}
              autoComplete="name"
              className="w-full rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 outline-none focus:border-[var(--notes-accent)]"
              placeholder="Optional"
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <span className="mt-1 block text-[var(--notes-muted)] text-xs">Up to 60 Unicode characters.</span>
          </label>

          <div>
            <p className="font-medium text-sm">Email</p>
            <p className="mt-1 text-[var(--notes-muted)] text-sm">{accountEmail}</p>
          </div>

          {updateProfile.isError ? (
            <p className="text-red-600 text-sm" role="alert">
              {updateProfile.error.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <button type="button" className="rounded-md border border-[var(--notes-border)] px-3 py-2 text-sm">
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="rounded-md bg-[var(--notes-accent)] px-3 py-2 font-medium text-sm text-white disabled:opacity-60"
            >
              {updateProfile.isPending ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
