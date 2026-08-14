import { describe, expect, it, vi } from 'vitest';
import {
  assertProtectionDecision,
  createBetterAuthEmailProtection,
  EMAIL_OTP_SEND_PATH,
} from '../src/adapters/better-auth.js';

const engine = { evaluate: vi.fn() };
const plugin = createBetterAuthEmailProtection({ engine });
const matcher = plugin.hooks?.before?.[0]?.matcher;

describe('Better Auth adapter', () => {
  it('matches only the exact email OTP send route', () => {
    expect(matcher?.({ path: EMAIL_OTP_SEND_PATH } as never)).toBe(true);
    expect(matcher?.({ path: `${EMAIL_OTP_SEND_PATH}/extra` } as never)).toBe(false);
    expect(matcher?.({ path: '/email-otp/verify-email' } as never)).toBe(false);
  });

  it('maps internal decisions to generic Better Auth errors', () => {
    expect(() =>
      assertProtectionDecision({ outcome: 'reject', reason: 'access_denied', enforced: true }, 'Generic')
    ).toThrow('Generic');
    expect(() =>
      assertProtectionDecision({ outcome: 'rate_limited', reason: 'email_rate_limited', enforced: true }, 'Generic')
    ).toThrow('Generic');
    expect(() =>
      assertProtectionDecision({ outcome: 'allow', reason: 'cached_pass', enforced: true }, 'Generic')
    ).not.toThrow();
  });
});
