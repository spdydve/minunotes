import { createMiddleware } from 'hono/factory';

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  skip?: (path: string) => boolean;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function getClientAddress(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'anonymous';
}

export function consumeRateLimit(
  key: string,
  { windowMs, max }: Pick<RateLimitOptions, 'windowMs' | 'max'>,
  now = Date.now()
) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, limit: max, remaining: Math.max(0, max - next.count), resetAt: next.resetAt };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: current.count <= max,
    limit: max,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt,
  };
}

export function resetRateLimitStore() {
  buckets.clear();
}

export function createRateLimitMiddleware({ windowMs, max, keyPrefix = 'global', skip }: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    if (skip?.(c.req.path)) {
      await next();
      return;
    }

    const client = getClientAddress(c.req.raw.headers);
    const key = `${keyPrefix}:${client}`;
    const result = consumeRateLimit(key, { windowMs, max });
    const resetInSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      c.header('Retry-After', String(resetInSeconds));
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    await next();
  });
}
