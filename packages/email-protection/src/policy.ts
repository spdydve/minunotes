import type { ProtectionPolicy } from './types.js';

export const DEFAULT_PROTECTION_POLICY = {
  mode: 'off',
  emailRateLimit: { max: 3, windowMs: 10 * 60 * 1000 },
  clientRateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
  reputation: { maxViolations: 5, windowMs: 24 * 60 * 60 * 1000, banMs: 24 * 60 * 60 * 1000 },
  cache: { passMs: 24 * 60 * 60 * 1000, failMs: 60 * 60 * 1000 },
  providerFailure: 'allow',
} satisfies ProtectionPolicy;

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

export function createProtectionPolicy(overrides: Partial<ProtectionPolicy> = {}): ProtectionPolicy {
  const policy: ProtectionPolicy = {
    ...DEFAULT_PROTECTION_POLICY,
    ...overrides,
    emailRateLimit: { ...DEFAULT_PROTECTION_POLICY.emailRateLimit, ...overrides.emailRateLimit },
    clientRateLimit: { ...DEFAULT_PROTECTION_POLICY.clientRateLimit, ...overrides.clientRateLimit },
    reputation: { ...DEFAULT_PROTECTION_POLICY.reputation, ...overrides.reputation },
    cache: { ...DEFAULT_PROTECTION_POLICY.cache, ...overrides.cache },
  };

  assertPositiveInteger(policy.emailRateLimit.max, 'emailRateLimit.max');
  assertPositiveInteger(policy.emailRateLimit.windowMs, 'emailRateLimit.windowMs');
  assertPositiveInteger(policy.clientRateLimit.max, 'clientRateLimit.max');
  assertPositiveInteger(policy.clientRateLimit.windowMs, 'clientRateLimit.windowMs');
  assertPositiveInteger(policy.reputation.maxViolations, 'reputation.maxViolations');
  assertPositiveInteger(policy.reputation.windowMs, 'reputation.windowMs');
  assertPositiveInteger(policy.reputation.banMs, 'reputation.banMs');
  assertPositiveInteger(policy.cache.passMs, 'cache.passMs');
  assertPositiveInteger(policy.cache.failMs, 'cache.failMs');

  return policy;
}
