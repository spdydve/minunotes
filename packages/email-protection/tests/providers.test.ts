import { GetEmailAddressInsightsCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it, vi } from 'vitest';
import { createDisposableEmailVerifier } from '../src/providers/disposable-domains.js';
import { createSesEmailVerifier } from '../src/providers/ses-email-insights.js';

function clientWithVerdict(verdict?: 'LOW' | 'MEDIUM' | 'HIGH') {
  return {
    send: vi.fn().mockResolvedValue({
      MailboxValidation: { IsValid: { ConfidenceVerdict: verdict } },
    }),
  };
}

describe('email verification providers', () => {
  it('recognizes disposable domains', () => {
    const verifier = createDisposableEmailVerifier(new Set(['mailinator.com']));
    expect(verifier.isDisposable('person@mailinator.com')).toBe(true);
    expect(verifier.isDisposable('person@example.com')).toBe(false);
  });

  it.each([
    ['HIGH', 'valid'],
    ['MEDIUM', 'valid'],
    ['LOW', 'invalid'],
    [undefined, 'indeterminate'],
  ] as const)('maps SES %s to %s', async (verdict, outcome) => {
    const client = clientWithVerdict(verdict);
    const verifier = createSesEmailVerifier(client);
    expect(await verifier.verify('person@example.com')).toMatchObject({ outcome });
    expect(client.send.mock.calls[0]?.[0]).toBeInstanceOf(GetEmailAddressInsightsCommand);
  });

  it('maps provider exceptions and timeouts to provider_error', async () => {
    const failed = createSesEmailVerifier({ send: vi.fn().mockRejectedValue(new Error('denied')) });
    expect(await failed.verify('person@example.com')).toEqual({ outcome: 'provider_error' });

    const stalled = createSesEmailVerifier({ send: vi.fn(() => new Promise(() => undefined)) }, { timeoutMs: 1 });
    expect(await stalled.verify('person@example.com')).toEqual({ outcome: 'provider_error' });
  });
});
