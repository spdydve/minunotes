import { APIError, type BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import type { ProtectionDecision, ProtectionEngine } from '../types.js';

export const EMAIL_OTP_SEND_PATH = '/email-otp/send-verification-otp';

export function assertProtectionDecision(result: ProtectionDecision, genericMessage: string) {
  if (result.outcome === 'rate_limited') {
    throw new APIError('TOO_MANY_REQUESTS', { message: genericMessage });
  }
  if (result.outcome === 'reject') {
    throw new APIError('BAD_REQUEST', { message: genericMessage });
  }
}

export function createBetterAuthEmailProtection(options: {
  engine: ProtectionEngine;
  getClientAddress?: (request: Request) => string | undefined;
  genericMessage?: string;
}): BetterAuthPlugin {
  const genericMessage = options.genericMessage ?? 'Unable to process this request.';

  return {
    id: 'email-protection',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === EMAIL_OTP_SEND_PATH,
          handler: createAuthMiddleware(async (context) => {
            const request = context.request;
            const email = (context.body as { email?: unknown } | undefined)?.email;
            const result = await options.engine.evaluate({
              email: typeof email === 'string' ? email : '',
              clientAddress: request ? options.getClientAddress?.(request) : undefined,
            });

            assertProtectionDecision(result, genericMessage);
            return { context };
          }),
        },
      ],
    },
  };
}
