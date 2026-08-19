import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: 'message_id' }));

vi.mock('../src/api/lib/email', () => ({ sendEmail }));
vi.mock('../src/api/lib/env', () => ({
  getApiRuntimeConfig: () => ({
    frontendUrl: 'https://notes.example.com',
    ses: { fromEmail: 'MinuNotes <notes@example.com>' },
  }),
}));

import { sendCollaborationGrantedEmail, sendCollaborationInvitationEmail } from '../src/api/lib/collaboration-email';

describe('collaboration email', () => {
  beforeEach(() => sendEmail.mockClear());

  it('sends invitation copy with the short public invite URL and a bounded safe subject', async () => {
    const delivery = await sendCollaborationInvitationEmail({
      to: 'invitee@example.com',
      ownerName: 'Owner <Admin>',
      resourceType: 'note',
      role: 'viewer',
      invitationUrl: 'https://notes.example.com/invite/token',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    expect(delivery).toBe('sent');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'A note has been shared with you from MinuNotes.',
        text: expect.stringContaining('https://notes.example.com/invite/token'),
        html: expect.stringContaining('Owner &lt;Admin&gt;'),
      })
    );
    const input = sendEmail.mock.calls[0]?.[0] as { text: string };
    expect(input.text).toContain('January 1, 2099 at 12:00 AM UTC');
    expect(input.text).not.toContain('2099-01-01T00:00:00.000Z');
  });

  it('links direct-grant notifications to the shared resource', async () => {
    await sendCollaborationGrantedEmail({
      to: 'collaborator@example.com',
      ownerName: 'Owner',
      resourceType: 'folder',
      resourceUrl: 'https://notes.example.com/folders/folder_a',
      role: 'editor',
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'A folder has been shared with you from MinuNotes.',
        text: expect.stringContaining('https://notes.example.com/folders/folder_a'),
      })
    );
  });
});
