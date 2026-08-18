import { sendEmail } from './email';
import { getApiRuntimeConfig } from './env';

export type CollaborationEmailDelivery = 'sent' | 'disabled' | 'failed';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInvitationExpiration(value: Date) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
  return `${formatted} UTC`;
}

function safeEmailHeaderValue(value: string) {
  let result = '';
  let replacingControlCharacters = false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isControlCharacter = codePoint <= 31 || codePoint === 127;
    if (isControlCharacter) {
      if (!replacingControlCharacters) result += ' ';
      replacingControlCharacters = true;
      continue;
    }
    result += character;
    replacingControlCharacters = false;
  }
  return result.trim().slice(0, 160);
}

async function deliver(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  messageType: 'invitation' | 'grant';
}) {
  const { ses } = getApiRuntimeConfig();
  if (!ses.fromEmail) return 'disabled' as const;
  try {
    const { messageId } = await sendEmail({
      ...input,
      subject: safeEmailHeaderValue(input.subject),
      from: ses.fromEmail,
    });
    console.info('[COLLABORATION EMAIL SENT]', { messageType: input.messageType, messageId: messageId ?? null });
    return 'sent' as const;
  } catch (error) {
    console.error('[COLLABORATION EMAIL ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown email error',
    });
    return 'failed' as const;
  }
}

export function sendCollaborationInvitationEmail(input: {
  to: string;
  ownerName: string;
  resourceType: 'note' | 'folder';
  role: string;
  invitationUrl: string;
  expiresAt: Date;
}) {
  const ownerName = input.ownerName.trim() || 'A MinuNotes user';
  const resourceLabel = input.resourceType === 'note' ? 'note' : 'folder';
  const subject = `A ${resourceLabel} has been shared with you from MinuNotes.`;
  const safeUrl = escapeHtml(input.invitationUrl);
  const expiration = formatInvitationExpiration(input.expiresAt);
  return deliver({
    to: input.to,
    subject,
    messageType: 'invitation',
    html: `<p>Access the ${resourceLabel} using the link below.</p><p><a href="${safeUrl}">Open ${resourceLabel} invitation</a></p><p>${escapeHtml(ownerName)} shared it with you as ${escapeHtml(input.role)}. Sign in or create an account with the invited email address. This invitation expires ${escapeHtml(expiration)}.</p>`,
    text: `Access the ${resourceLabel} using the link below.\n\n${input.invitationUrl}\n\n${ownerName} shared it with you as ${input.role}. Sign in or create an account with the invited email address. This invitation expires ${expiration}.`,
  });
}

export function sendCollaborationGrantedEmail(input: {
  to: string;
  ownerName: string;
  resourceType: 'note' | 'folder';
  resourceUrl: string;
  role: string;
}) {
  const ownerName = input.ownerName.trim() || 'A MinuNotes user';
  const resourceLabel = input.resourceType === 'note' ? 'note' : 'folder';
  return deliver({
    to: input.to,
    subject: `A ${resourceLabel} has been shared with you from MinuNotes.`,
    messageType: 'grant',
    html: `<p>Access the ${resourceLabel} using the link below.</p><p><a href="${escapeHtml(input.resourceUrl)}">Open ${resourceLabel}</a></p><p>${escapeHtml(ownerName)} shared it with you as ${escapeHtml(input.role)}.</p>`,
    text: `Access the ${resourceLabel} using the link below.\n\n${input.resourceUrl}\n\n${ownerName} shared it with you as ${input.role}.`,
  });
}
