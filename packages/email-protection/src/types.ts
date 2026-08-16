export type ProtectionMode = 'off' | 'observe' | 'enforce';
export type EmailVerdict = 'pass' | 'fail';
export type VerificationOutcome = 'valid' | 'invalid' | 'indeterminate' | 'provider_error';

export type ProtectionReason =
  | 'disabled'
  | 'access_denied'
  | 'invalid_email'
  | 'email_rate_limited'
  | 'client_rate_limited'
  | 'client_banned'
  | 'disposable_email'
  | 'cached_pass'
  | 'cached_fail'
  | 'provider_valid'
  | 'provider_invalid'
  | 'provider_indeterminate'
  | 'provider_error'
  | 'verification_bypassed';

export type ProtectionDecision = {
  outcome: 'allow' | 'reject' | 'rate_limited';
  reason: ProtectionReason;
  enforced: boolean;
  retryAfterMs?: number;
};

export type VerificationResult = {
  outcome: VerificationOutcome;
  confidence?: 'low' | 'medium' | 'high';
};

export type CachedEmailVerdict = {
  verdict: EmailVerdict;
  expiresAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetAt: number;
};

export type ClientReputation = {
  bannedUntil: number | null;
  violationCount: number;
  violationWindowStartedAt: number;
};

export type ProtectionCleanupResult = {
  verdictsDeleted: number;
  rateLimitsDeleted: number;
  reputationsDeleted: number;
};

export type ProtectionStoreCleanup = {
  deleteExpired(options: { now: number; staleReputationBefore: number }): Promise<ProtectionCleanupResult>;
};

export type ProtectionStore = {
  getEmailVerdict(emailKey: string, now: number): Promise<CachedEmailVerdict | null>;
  setEmailVerdict(emailKey: string, verdict: EmailVerdict, expiresAt: number, now: number): Promise<void>;
  consumeRateLimit(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
  getClientReputation(clientKey: string, now: number): Promise<ClientReputation | null>;
  recordClientViolation(
    clientKey: string,
    options: { maxViolations: number; windowMs: number; banMs: number; now: number }
  ): Promise<ClientReputation>;
};

export type EmailVerifier = {
  verify(email: string): Promise<VerificationResult>;
};

export type DisposableEmailVerifier = {
  isDisposable(email: string): boolean;
};

export type ProtectionPolicy = {
  mode: ProtectionMode;
  emailRateLimit: { max: number; windowMs: number };
  clientRateLimit: { max: number; windowMs: number };
  reputation: { maxViolations: number; windowMs: number; banMs: number };
  cache: { passMs: number; failMs: number };
  providerFailure: 'allow' | 'reject';
};

export type ProtectionLogger = {
  event(event: {
    outcome: ProtectionDecision['outcome'];
    reason: ProtectionReason;
    emailKey: string;
    clientKey?: string;
  }): void;
};

export type ProtectionRequest = {
  email: string;
  clientAddress?: string;
};

export type ProtectionEngine = {
  evaluate(request: ProtectionRequest): Promise<ProtectionDecision>;
};
