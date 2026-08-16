import { createClient } from '@libsql/client';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterAuthEmailProtection } from '../src/adapters/better-auth.js';
import { createProtectionEngine } from '../src/engine.js';
import { createDisposableEmailVerifier } from '../src/providers/disposable-domains.js';
import { createSqliteProtectionStore } from '../src/stores/sqlite.js';

let client: ReturnType<typeof createClient>;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE email_protection_verdicts (
      email_key TEXT PRIMARY KEY, verdict TEXT NOT NULL, expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE email_protection_rate_limits (
      bucket_key TEXT PRIMARY KEY, request_count INTEGER NOT NULL, window_started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE email_protection_client_reputation (
      client_key TEXT PRIMARY KEY, violation_count INTEGER NOT NULL, violation_window_started_at INTEGER NOT NULL,
      banned_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
});

afterEach(() => client.close());

describe('Better Auth integration', () => {
  it('blocks a disposable OTP request before the sender runs', async () => {
    const sendVerificationOTP = vi.fn();
    const verify = vi.fn();
    const engine = createProtectionEngine({
      policy: {
        mode: 'enforce',
        emailRateLimit: { max: 3, windowMs: 10 * 60 * 1000 },
        clientRateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
        reputation: { maxViolations: 5, windowMs: 24 * 60 * 60 * 1000, banMs: 24 * 60 * 60 * 1000 },
        cache: { passMs: 24 * 60 * 60 * 1000, failMs: 60 * 60 * 1000 },
        providerFailure: 'allow',
      },
      store: createSqliteProtectionStore(client),
      verifier: { verify },
      disposable: createDisposableEmailVerifier(new Set(['mailinator.com'])),
      hashIdentity: (namespace, value) => `${namespace}:${value}`,
      now: () => 1_000,
    });
    const auth = betterAuth({
      baseURL: 'http://api.test/internal/auth',
      secret: 'test-secret-that-is-at-least-32-characters',
      plugins: [createBetterAuthEmailProtection({ engine }), emailOTP({ sendVerificationOTP })],
    });

    const response = await auth.handler(
      new Request('http://api.test/internal/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'person@mailinator.com', type: 'sign-in' }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Unable to process this request.' });
    expect(verify).not.toHaveBeenCalled();
    expect(sendVerificationOTP).not.toHaveBeenCalled();
  });
});
