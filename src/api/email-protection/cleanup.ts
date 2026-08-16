import { DEFAULT_PROTECTION_POLICY } from '@minunotes/email-protection/policy';
import { createSqliteProtectionStore } from '@minunotes/email-protection/sqlite';
import { libsql } from '../db/client';

export async function cleanupExpiredEmailProtectionState(now = Date.now()) {
  const store = createSqliteProtectionStore(libsql);
  return store.deleteExpired({
    now,
    staleReputationBefore: now - DEFAULT_PROTECTION_POLICY.reputation.windowMs,
  });
}
