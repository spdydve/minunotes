import { describe, expect, it, vi } from 'vitest';
import { createProtectionEngine } from '../src/engine.js';
import { createProtectionPolicy } from '../src/policy.js';
import type { ProtectionStore } from '../src/types.js';

function createStore(): ProtectionStore {
  const verdicts = new Map<string, { verdict: 'pass' | 'fail'; expiresAt: number }>();
  const rates = new Map<string, { count: number; resetAt: number }>();
  const reputations = new Map<
    string,
    { bannedUntil: number | null; violationCount: number; violationWindowStartedAt: number }
  >();

  return {
    async getEmailVerdict(key, now) {
      const verdict = verdicts.get(key);
      return verdict && verdict.expiresAt > now ? verdict : null;
    },
    async setEmailVerdict(key, verdict, expiresAt) {
      verdicts.set(key, { verdict, expiresAt });
    },
    async consumeRateLimit(key, limit, windowMs, now) {
      const current = rates.get(key);
      const next =
        !current || current.resetAt <= now
          ? { count: 1, resetAt: now + windowMs }
          : { ...current, count: current.count + 1 };
      rates.set(key, next);
      return { ...next, allowed: next.count <= limit };
    },
    async getClientReputation(key, now) {
      const reputation = reputations.get(key);
      if (!reputation) return null;
      return {
        ...reputation,
        bannedUntil: reputation.bannedUntil && reputation.bannedUntil > now ? reputation.bannedUntil : null,
      };
    },
    async recordClientViolation(key, options) {
      const current = reputations.get(key);
      const reset =
        !current ||
        current.violationWindowStartedAt + options.windowMs <= options.now ||
        Boolean(current.bannedUntil && current.bannedUntil <= options.now);
      const violationCount = reset ? 1 : current.violationCount + 1;
      const reputation = {
        violationCount,
        violationWindowStartedAt: reset ? options.now : current.violationWindowStartedAt,
        bannedUntil: violationCount >= options.maxViolations ? options.now + options.banMs : null,
      };
      reputations.set(key, reputation);
      return reputation;
    },
  };
}

function setup(
  overrides: {
    outcome?: 'valid' | 'invalid' | 'indeterminate' | 'provider_error';
    mode?: 'off' | 'observe' | 'enforce';
    disposable?: boolean;
    allowed?: boolean;
  } = {}
) {
  const verify = vi.fn().mockResolvedValue({ outcome: overrides.outcome ?? 'valid' });
  const engine = createProtectionEngine({
    policy: createProtectionPolicy({ mode: overrides.mode ?? 'enforce' }),
    store: createStore(),
    verifier: { verify },
    disposable: { isDisposable: () => overrides.disposable ?? false },
    hashIdentity: (namespace, value) => `${namespace}:${value}`,
    isEmailAllowed: () => overrides.allowed ?? true,
    now: () => 1_000,
  });
  return { engine, verify };
}

describe('email protection engine', () => {
  it('rejects malformed and unauthorized emails before provider validation', async () => {
    const malformed = setup();
    expect(await malformed.engine.evaluate({ email: 'not-an-email' })).toMatchObject({
      outcome: 'reject',
      reason: 'invalid_email',
    });
    expect(malformed.verify).not.toHaveBeenCalled();

    const denied = setup({ allowed: false });
    expect(await denied.engine.evaluate({ email: 'user@example.com' })).toMatchObject({
      outcome: 'reject',
      reason: 'access_denied',
    });
    expect(denied.verify).not.toHaveBeenCalled();
  });

  it('rejects disposable and provider-invalid emails', async () => {
    expect(
      await setup({ disposable: true }).engine.evaluate({ email: 'user@example.com', clientAddress: '203.0.113.1' })
    ).toMatchObject({ outcome: 'reject', reason: 'disposable_email' });
    expect(await setup({ outcome: 'invalid' }).engine.evaluate({ email: 'user@example.com' })).toMatchObject({
      outcome: 'reject',
      reason: 'provider_invalid',
    });
  });

  it('does not poison requests on provider errors by default', async () => {
    expect(await setup({ outcome: 'provider_error' }).engine.evaluate({ email: 'user@example.com' })).toMatchObject({
      outcome: 'allow',
      reason: 'provider_error',
      enforced: false,
    });
  });

  it('observes abuse decisions without weakening the access policy', async () => {
    expect(
      await setup({ disposable: true, mode: 'observe' }).engine.evaluate({ email: 'user@example.com' })
    ).toMatchObject({ outcome: 'allow', reason: 'disposable_email', enforced: false });
    expect(
      await setup({ allowed: false, mode: 'observe' }).engine.evaluate({ email: 'user@example.com' })
    ).toMatchObject({ outcome: 'reject', reason: 'access_denied' });
  });

  it('enforces durable email rate limits', async () => {
    const { engine } = setup();
    const request = { email: 'user@example.com' };
    await engine.evaluate(request);
    await engine.evaluate(request);
    await engine.evaluate(request);
    expect(await engine.evaluate(request)).toMatchObject({ outcome: 'rate_limited', reason: 'email_rate_limited' });
  });
});
