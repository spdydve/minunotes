import { SESv2Client } from '@aws-sdk/client-sesv2';
import {
  createBetterAuthEmailProtection,
  createDisposableEmailVerifier,
  createIdentityHasher,
  createProtectionEngine,
  createProtectionPolicy,
  createSesEmailVerifier,
  createSqliteProtectionStore,
  normalizeEmail,
  type ProtectionLogger,
} from '@minunotes/email-protection';
import { libsql } from '../db/client';
import { TRUSTED_CLIENT_ADDRESS_HEADER } from '../middleware/client-identity';
import { getApiRuntimeConfig } from './env';

const runtime = getApiRuntimeConfig();
const allowedEmails = new Set(runtime.allowedLoginEmails);
const bypassEmails = new Set(runtime.emailProtection.bypassEmails);
if (runtime.emailProtection.mode !== 'off' && runtime.emailProtection.hashSecret.length < 32) {
  throw new Error('EMAIL_PROTECTION_HASH_SECRET or BETTER_AUTH_SECRET must contain at least 32 characters');
}
const hashIdentity = createIdentityHasher(
  runtime.emailProtection.hashSecret || 'local-development-email-protection-secret'
);

const logger: ProtectionLogger = {
  event(event) {
    if (runtime.emailProtection.mode === 'off') return;
    console.info('[email-protection]', {
      outcome: event.outcome,
      reason: event.reason,
      emailKey: event.emailKey.slice(0, 12),
      clientKey: event.clientKey?.slice(0, 12),
    });
  },
};

const engine = createProtectionEngine({
  policy: createProtectionPolicy({
    mode: runtime.emailProtection.mode,
    emailRateLimit: { max: runtime.emailProtection.emailRateMax, windowMs: 10 * 60 * 1000 },
    clientRateLimit: { max: runtime.emailProtection.clientRateMax, windowMs: 10 * 60 * 1000 },
  }),
  store: createSqliteProtectionStore(libsql),
  verifier: createSesEmailVerifier(new SESv2Client({ region: runtime.ses.region }), {
    timeoutMs: runtime.emailProtection.sesTimeoutMs,
  }),
  disposable: createDisposableEmailVerifier(),
  hashIdentity,
  isEmailAllowed: allowedEmails.size === 0 ? undefined : (email) => allowedEmails.has(email),
  bypassVerification: (email) => (allowedEmails.size > 0 && allowedEmails.has(email)) || bypassEmails.has(email),
  logger,
});

export const emailProtectionPlugin = createBetterAuthEmailProtection({
  engine,
  getClientAddress(request) {
    return request.headers.get(TRUSTED_CLIENT_ADDRESS_HEADER)?.trim() || undefined;
  },
});

export function isAllowedLoginEmail(email: string) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && (allowedEmails.size === 0 || allowedEmails.has(normalized)));
}
