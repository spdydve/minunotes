import { useMutation, useQuery } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/button';
import { ApiError, api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { rootRoute } from './__root';

const ROLE_LABEL = { viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor' } as const;

function CollaborationInvitationView() {
  const { token } = inviteRoute.useParams();
  const session = authClient.useSession();
  const invitationPath = `/invite/${encodeURIComponent(token)}`;
  const preview = useQuery({
    queryKey: ['collaboration-invitation', token],
    queryFn: () => api.collaborationInvitationPreview(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.acceptCollaborationInvitation(token),
    onSuccess: ({ destination }) => {
      window.location.href = destination;
    },
  });

  if (preview.isLoading || session.isPending)
    return (
      <InvitationPage>
        <p className="notes-muted text-sm">Loading invitation…</p>
      </InvitationPage>
    );
  if (preview.error || !preview.data)
    return (
      <InvitationCard title="Invitation unavailable">
        <p className="notes-muted text-sm">This invitation is invalid, expired, revoked, or no longer available.</p>
        <Link to="/" className="mt-4 inline-block text-[var(--notes-blue)] text-sm hover:underline">
          Go to MinuNotes
        </Link>
      </InvitationCard>
    );

  const invitation = preview.data;
  const mismatch = accept.error instanceof ApiError && accept.error.status === 403;

  return (
    <InvitationCard title={invitation.status === 'accepted' ? 'Invitation already accepted' : 'You’re invited'}>
      <div className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-bg)] p-4">
        <div className="flex items-start gap-3">
          {invitation.status === 'accepted' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          ) : (
            <UserRound className="mt-0.5 h-5 w-5 text-[var(--notes-muted)]" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm">
              {invitation.owner.name || 'A MinuNotes user'} shared “{invitation.resource.title}”
            </p>
            <p className="notes-muted mt-1 text-xs">
              {invitation.resource.type === 'folder' ? 'Folder' : 'Note'} · {ROLE_LABEL[invitation.role]} · Invited as{' '}
              {invitation.invitedEmail}
            </p>
            <p className="notes-muted mt-1 text-xs">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {!session.data?.user ? (
        <div className="mt-5">
          <p className="notes-muted text-sm">
            Sign in or create an account with the invited email address to continue.
          </p>
          <Link to="/auth" search={{ redirect: invitationPath }} className="mt-3 block">
            <Button variant="base" className="w-full">
              Continue with email
            </Button>
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="notes-muted text-sm">Signed in as {session.data.user.email}</p>
          {mismatch ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              This account does not match the invited email. Sign out and continue with the invited account.
            </p>
          ) : null}
          {accept.error && !mismatch ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-900 text-sm dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              Unable to accept this invitation. It may no longer be available.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="base"
              className="flex-1"
              disabled={accept.isPending || mismatch}
              onClick={() => accept.mutate()}
            >
              {accept.isPending
                ? 'Accepting…'
                : invitation.status === 'accepted'
                  ? 'Open shared content'
                  : 'Accept invitation'}
            </Button>
            <Button
              disabled={accept.isPending}
              onClick={async () => {
                await authClient.signOut();
                window.location.href = `/auth?redirect=${encodeURIComponent(invitationPath)}`;
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </InvitationCard>
  );
}

function InvitationPage({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--notes-bg)] p-4 text-[var(--notes-text)]">
      {children}
    </main>
  );
}

function InvitationCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <InvitationPage>
      <section className="w-full max-w-lg rounded-2xl border border-[var(--notes-border)] bg-[var(--notes-panel)] p-5 shadow-sm">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <div className="mt-4">{children}</div>
      </section>
    </InvitationPage>
  );
}

export const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: CollaborationInvitationView,
});
