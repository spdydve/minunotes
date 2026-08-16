import { GetEmailAddressInsightsCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailVerifier, VerificationResult } from '../types.js';

export type SesEmailInsightsClient = Pick<SESv2Client, 'send'>;

export function createSesEmailVerifier(
  client: SesEmailInsightsClient,
  options: { timeoutMs?: number } = {}
): EmailVerifier {
  const timeoutMs = options.timeoutMs ?? 2000;

  return {
    async verify(email): Promise<VerificationResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await Promise.race([
          client.send(new GetEmailAddressInsightsCommand({ EmailAddress: email }), {
            abortSignal: controller.signal,
          }),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('SES email insight timeout')), {
              once: true,
            });
          }),
        ]);
        const verdict = response.MailboxValidation?.IsValid?.ConfidenceVerdict?.toLowerCase();

        if (verdict === 'high') return { outcome: 'valid', confidence: 'high' };
        if (verdict === 'medium') return { outcome: 'valid', confidence: 'medium' };
        if (verdict === 'low') return { outcome: 'invalid', confidence: 'low' };
        return { outcome: 'indeterminate' };
      } catch {
        return { outcome: 'provider_error' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
