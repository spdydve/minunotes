import type { Client, InValue } from '@libsql/client';
import type {
  ClientReputation,
  EmailVerdict,
  ProtectionStore,
  ProtectionStoreCleanup,
  RateLimitResult,
} from '../types.js';

function numberValue(value: InValue | undefined) {
  return Number(value ?? 0);
}

export function createSqliteProtectionStore(client: Pick<Client, 'execute'>): ProtectionStore & ProtectionStoreCleanup {
  return {
    async deleteExpired({ now, staleReputationBefore }) {
      const [verdicts, rateLimits, reputations] = await Promise.all([
        client.execute({ sql: 'DELETE FROM email_protection_verdicts WHERE expires_at <= ?', args: [now] }),
        client.execute({ sql: 'DELETE FROM email_protection_rate_limits WHERE expires_at <= ?', args: [now] }),
        client.execute({
          sql: `DELETE FROM email_protection_client_reputation
                WHERE (banned_until IS NOT NULL AND banned_until <= ?)
                   OR (banned_until IS NULL AND violation_window_started_at <= ?)`,
          args: [now, staleReputationBefore],
        }),
      ]);
      return {
        verdictsDeleted: verdicts.rowsAffected,
        rateLimitsDeleted: rateLimits.rowsAffected,
        reputationsDeleted: reputations.rowsAffected,
      };
    },
    async getEmailVerdict(emailKey, now) {
      const result = await client.execute({
        sql: `SELECT verdict, expires_at FROM email_protection_verdicts
              WHERE email_key = ? AND expires_at > ? LIMIT 1`,
        args: [emailKey, now],
      });
      const row = result.rows[0];
      if (!row || (row.verdict !== 'pass' && row.verdict !== 'fail')) return null;
      return { verdict: row.verdict, expiresAt: numberValue(row.expires_at) };
    },

    async setEmailVerdict(emailKey, verdict: EmailVerdict, expiresAt, now) {
      await client.execute({
        sql: `INSERT INTO email_protection_verdicts (email_key, verdict, expires_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(email_key) DO UPDATE SET
                verdict = excluded.verdict,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at`,
        args: [emailKey, verdict, expiresAt, now, now],
      });
    },

    async consumeRateLimit(key, limit, windowMs, now): Promise<RateLimitResult> {
      const result = await client.execute({
        sql: `INSERT INTO email_protection_rate_limits
                (bucket_key, request_count, window_started_at, expires_at, created_at, updated_at)
              VALUES (?, 1, ?, ?, ?, ?)
              ON CONFLICT(bucket_key) DO UPDATE SET
                request_count = CASE
                  WHEN email_protection_rate_limits.expires_at <= excluded.window_started_at THEN 1
                  ELSE email_protection_rate_limits.request_count + 1
                END,
                window_started_at = CASE
                  WHEN email_protection_rate_limits.expires_at <= excluded.window_started_at
                    THEN excluded.window_started_at
                  ELSE email_protection_rate_limits.window_started_at
                END,
                expires_at = CASE
                  WHEN email_protection_rate_limits.expires_at <= excluded.window_started_at THEN excluded.expires_at
                  ELSE email_protection_rate_limits.expires_at
                END,
                updated_at = excluded.updated_at
              RETURNING request_count, expires_at`,
        args: [key, now, now + windowMs, now, now],
      });
      const row = result.rows[0];
      const count = numberValue(row?.request_count);
      const resetAt = numberValue(row?.expires_at);
      return { allowed: count <= limit, count, resetAt };
    },

    async getClientReputation(clientKey, now): Promise<ClientReputation | null> {
      const result = await client.execute({
        sql: `SELECT violation_count, violation_window_started_at, banned_until
              FROM email_protection_client_reputation WHERE client_key = ? LIMIT 1`,
        args: [clientKey],
      });
      const row = result.rows[0];
      if (!row) return null;
      const bannedUntil = row.banned_until === null ? null : numberValue(row.banned_until);
      return {
        bannedUntil: bannedUntil && bannedUntil > now ? bannedUntil : null,
        violationCount: numberValue(row.violation_count),
        violationWindowStartedAt: numberValue(row.violation_window_started_at),
      };
    },

    async recordClientViolation(clientKey, { maxViolations, windowMs, banMs, now }): Promise<ClientReputation> {
      const result = await client.execute({
        sql: `INSERT INTO email_protection_client_reputation
                (client_key, violation_count, violation_window_started_at, banned_until, created_at, updated_at)
              VALUES (?, 1, ?, CASE WHEN 1 >= ? THEN ? ELSE NULL END, ?, ?)
              ON CONFLICT(client_key) DO UPDATE SET
                violation_count = CASE
                  WHEN email_protection_client_reputation.violation_window_started_at + ? <= excluded.violation_window_started_at
                    OR COALESCE(email_protection_client_reputation.banned_until, 0) <= excluded.violation_window_started_at
                      AND email_protection_client_reputation.banned_until IS NOT NULL
                    THEN 1
                  ELSE email_protection_client_reputation.violation_count + 1
                END,
                violation_window_started_at = CASE
                  WHEN email_protection_client_reputation.violation_window_started_at + ? <= excluded.violation_window_started_at
                    OR COALESCE(email_protection_client_reputation.banned_until, 0) <= excluded.violation_window_started_at
                      AND email_protection_client_reputation.banned_until IS NOT NULL
                    THEN excluded.violation_window_started_at
                  ELSE email_protection_client_reputation.violation_window_started_at
                END,
                banned_until = CASE
                  WHEN (CASE
                    WHEN email_protection_client_reputation.violation_window_started_at + ? <= excluded.violation_window_started_at
                      OR COALESCE(email_protection_client_reputation.banned_until, 0) <= excluded.violation_window_started_at
                        AND email_protection_client_reputation.banned_until IS NOT NULL
                      THEN 1
                    ELSE email_protection_client_reputation.violation_count + 1
                  END) >= ? THEN excluded.violation_window_started_at + ?
                  ELSE NULL
                END,
                updated_at = excluded.updated_at
              RETURNING violation_count, violation_window_started_at, banned_until`,
        args: [
          clientKey,
          now,
          maxViolations,
          now + banMs,
          now,
          now,
          windowMs,
          windowMs,
          windowMs,
          maxViolations,
          banMs,
        ],
      });
      const row = result.rows[0];
      return {
        bannedUntil: row?.banned_until === null ? null : numberValue(row?.banned_until),
        violationCount: numberValue(row?.violation_count),
        violationWindowStartedAt: numberValue(row?.violation_window_started_at),
      };
    },
  };
}
