import { normalizeClientAddress, normalizeEmail } from './identity.js';
import type {
  DisposableEmailVerifier,
  EmailVerifier,
  ProtectionDecision,
  ProtectionEngine,
  ProtectionLogger,
  ProtectionPolicy,
  ProtectionReason,
  ProtectionStore,
} from './types.js';

type EngineDependencies = {
  policy: ProtectionPolicy;
  store: ProtectionStore;
  verifier: EmailVerifier;
  disposable: DisposableEmailVerifier;
  hashIdentity: (namespace: 'email' | 'client' | 'rate', value: string) => string;
  isEmailAllowed?: (email: string) => boolean;
  bypassVerification?: (email: string, clientAddress?: string) => boolean;
  logger?: ProtectionLogger;
  now?: () => number;
};

function decision(
  outcome: ProtectionDecision['outcome'],
  reason: ProtectionReason,
  enforced = true,
  retryAfterMs?: number
) {
  return { outcome, reason, enforced, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
}

export function createProtectionEngine(dependencies: EngineDependencies): ProtectionEngine {
  const now = dependencies.now ?? Date.now;

  const finish = (
    result: ProtectionDecision,
    identities: { emailKey: string; clientKey?: string }
  ): ProtectionDecision => {
    const effective =
      dependencies.policy.mode === 'observe' &&
      result.outcome !== 'allow' &&
      result.reason !== 'access_denied' &&
      result.reason !== 'invalid_email'
        ? decision('allow', result.reason, false, result.retryAfterMs)
        : result;
    dependencies.logger?.event({
      outcome: effective.outcome,
      reason: result.reason,
      emailKey: identities.emailKey,
      clientKey: identities.clientKey,
    });
    return effective;
  };

  const recordViolation = async (clientKey: string | undefined, timestamp: number) => {
    if (!clientKey) return;
    await dependencies.store.recordClientViolation(clientKey, {
      maxViolations: dependencies.policy.reputation.maxViolations,
      windowMs: dependencies.policy.reputation.windowMs,
      banMs: dependencies.policy.reputation.banMs,
      now: timestamp,
    });
  };

  return {
    async evaluate(request) {
      const email = normalizeEmail(request.email);
      const clientAddress = normalizeClientAddress(request.clientAddress);
      const emailKey = dependencies.hashIdentity('email', email ?? request.email.trim().toLowerCase());
      const clientKey = clientAddress ? dependencies.hashIdentity('client', clientAddress) : undefined;
      const identities = { emailKey, clientKey };

      if (!email) return finish(decision('reject', 'invalid_email'), identities);
      if (dependencies.isEmailAllowed && !dependencies.isEmailAllowed(email)) {
        return finish(decision('reject', 'access_denied'), identities);
      }
      if (dependencies.policy.mode === 'off') return finish(decision('allow', 'disabled', false), identities);

      const timestamp = now();
      const emailLimit = await dependencies.store.consumeRateLimit(
        dependencies.hashIdentity('rate', `email:${email}`),
        dependencies.policy.emailRateLimit.max,
        dependencies.policy.emailRateLimit.windowMs,
        timestamp
      );
      if (!emailLimit.allowed) {
        return finish(decision('rate_limited', 'email_rate_limited', true, emailLimit.resetAt - timestamp), identities);
      }

      if (clientKey) {
        const clientLimit = await dependencies.store.consumeRateLimit(
          dependencies.hashIdentity('rate', `client:${clientAddress}`),
          dependencies.policy.clientRateLimit.max,
          dependencies.policy.clientRateLimit.windowMs,
          timestamp
        );
        if (!clientLimit.allowed) {
          return finish(
            decision('rate_limited', 'client_rate_limited', true, clientLimit.resetAt - timestamp),
            identities
          );
        }

        const reputation = await dependencies.store.getClientReputation(clientKey, timestamp);
        if (reputation?.bannedUntil && reputation.bannedUntil > timestamp) {
          return finish(
            decision('rate_limited', 'client_banned', true, reputation.bannedUntil - timestamp),
            identities
          );
        }
      }

      if (dependencies.bypassVerification?.(email, clientAddress)) {
        return finish(decision('allow', 'verification_bypassed'), identities);
      }

      if (dependencies.disposable.isDisposable(email)) {
        await Promise.all([
          dependencies.store.setEmailVerdict(emailKey, 'fail', timestamp + dependencies.policy.cache.failMs, timestamp),
          recordViolation(clientKey, timestamp),
        ]);
        return finish(decision('reject', 'disposable_email'), identities);
      }

      const cached = await dependencies.store.getEmailVerdict(emailKey, timestamp);
      if (cached?.verdict === 'pass') return finish(decision('allow', 'cached_pass'), identities);
      if (cached?.verdict === 'fail') {
        await recordViolation(clientKey, timestamp);
        return finish(decision('reject', 'cached_fail'), identities);
      }

      const verification = await dependencies.verifier.verify(email);
      if (verification.outcome === 'valid') {
        await dependencies.store.setEmailVerdict(
          emailKey,
          'pass',
          timestamp + dependencies.policy.cache.passMs,
          timestamp
        );
        return finish(decision('allow', 'provider_valid'), identities);
      }
      if (verification.outcome === 'invalid') {
        await Promise.all([
          dependencies.store.setEmailVerdict(emailKey, 'fail', timestamp + dependencies.policy.cache.failMs, timestamp),
          recordViolation(clientKey, timestamp),
        ]);
        return finish(decision('reject', 'provider_invalid'), identities);
      }
      if (verification.outcome === 'indeterminate') {
        const result =
          dependencies.policy.providerFailure === 'allow'
            ? decision('allow', 'provider_indeterminate', false)
            : decision('reject', 'provider_indeterminate');
        return finish(result, identities);
      }

      const result =
        dependencies.policy.providerFailure === 'allow'
          ? decision('allow', 'provider_error', false)
          : decision('reject', 'provider_error');
      return finish(result, identities);
    },
  };
}
