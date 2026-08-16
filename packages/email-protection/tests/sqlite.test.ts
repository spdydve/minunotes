import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('SQLite protection store', () => {
  it('increments rate buckets atomically and resets expired windows', async () => {
    const store = createSqliteProtectionStore(client);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.consumeRateLimit('rate-key', 100, 1_000, 100))
    );
    expect(Math.max(...results.map((result) => result.count))).toBe(20);
    expect(await store.consumeRateLimit('rate-key', 100, 1_000, 1_101)).toMatchObject({ count: 1, resetAt: 2_101 });
  });

  it('expires verdicts without exposing raw identifiers', async () => {
    const store = createSqliteProtectionStore(client);
    await store.setEmailVerdict('hashed-email', 'fail', 2_000, 1_000);
    expect(await store.getEmailVerdict('hashed-email', 1_500)).toEqual({ verdict: 'fail', expiresAt: 2_000 });
    expect(await store.getEmailVerdict('hashed-email', 2_000)).toBeNull();

    const rows = await client.execute('SELECT email_key FROM email_protection_verdicts');
    expect(rows.rows[0]?.email_key).toBe('hashed-email');
  });

  it('deletes expired state while preserving active and recent rows', async () => {
    const store = createSqliteProtectionStore(client);
    await store.setEmailVerdict('expired-email', 'fail', 500, 100);
    await store.setEmailVerdict('active-email', 'pass', 1_500, 100);
    await store.consumeRateLimit('expired-rate', 1, 400, 100);
    await store.consumeRateLimit('active-rate', 1, 1_000, 100);
    await store.recordClientViolation('stale-client', {
      maxViolations: 5,
      windowMs: 1_000,
      banMs: 100,
      now: 100,
    });
    await store.recordClientViolation('recent-client', {
      maxViolations: 5,
      windowMs: 1_000,
      banMs: 100,
      now: 900,
    });
    await store.recordClientViolation('expired-ban', {
      maxViolations: 1,
      windowMs: 1_000,
      banMs: 100,
      now: 100,
    });
    await store.recordClientViolation('active-ban', {
      maxViolations: 1,
      windowMs: 1_000,
      banMs: 1_000,
      now: 900,
    });

    await expect(store.deleteExpired({ now: 1_000, staleReputationBefore: 500 })).resolves.toEqual({
      verdictsDeleted: 1,
      rateLimitsDeleted: 1,
      reputationsDeleted: 2,
    });
    expect((await client.execute('SELECT email_key FROM email_protection_verdicts')).rows).toMatchObject([
      { email_key: 'active-email' },
    ]);
    expect((await client.execute('SELECT bucket_key FROM email_protection_rate_limits')).rows).toMatchObject([
      { bucket_key: 'active-rate' },
    ]);
    const reputations = await client.execute(
      'SELECT client_key FROM email_protection_client_reputation ORDER BY client_key'
    );
    expect(reputations.rows).toMatchObject([{ client_key: 'active-ban' }, { client_key: 'recent-client' }]);
  });

  it('bans at the threshold and resets after a ban expires', async () => {
    const store = createSqliteProtectionStore(client);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const reputation = await store.recordClientViolation('hashed-client', {
        maxViolations: 5,
        windowMs: 10_000,
        banMs: 5_000,
        now: 1_000 + attempt,
      });
      expect(reputation.violationCount).toBe(attempt);
    }
    expect(await store.getClientReputation('hashed-client', 2_000)).toMatchObject({ bannedUntil: 6_005 });

    const reset = await store.recordClientViolation('hashed-client', {
      maxViolations: 5,
      windowMs: 10_000,
      banMs: 5_000,
      now: 6_006,
    });
    expect(reset).toMatchObject({ violationCount: 1, bannedUntil: null, violationWindowStartedAt: 6_006 });
  });
});
