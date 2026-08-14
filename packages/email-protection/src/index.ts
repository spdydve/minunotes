export {
  assertProtectionDecision,
  createBetterAuthEmailProtection,
  EMAIL_OTP_SEND_PATH,
} from './adapters/better-auth.js';
export { createProtectionEngine } from './engine.js';
export { createIdentityHasher, normalizeClientAddress, normalizeEmail } from './identity.js';
export { createProtectionPolicy, DEFAULT_PROTECTION_POLICY } from './policy.js';
export { createDisposableEmailVerifier } from './providers/disposable-domains.js';
export { createSesEmailVerifier, type SesEmailInsightsClient } from './providers/ses-email-insights.js';
export { createSqliteProtectionStore } from './stores/sqlite.js';
export type {
  CachedEmailVerdict,
  ClientReputation,
  DisposableEmailVerifier,
  EmailVerdict,
  EmailVerifier,
  ProtectionDecision,
  ProtectionEngine,
  ProtectionLogger,
  ProtectionMode,
  ProtectionPolicy,
  ProtectionReason,
  ProtectionRequest,
  ProtectionStore,
  ProtectionStoreCleanup,
  RateLimitResult,
  VerificationOutcome,
  VerificationResult,
} from './types.js';
