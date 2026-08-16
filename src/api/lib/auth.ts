import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { db } from '../db/client';
import { sendEmail } from './email';
import { emailProtectionPlugin } from './email-protection';
import { getApiRuntimeConfig } from './env';
import { createOtpEmailSender } from './otp-email';

const { frontendUrl, apiUrl, betterAuthUrl, allowedOrigins, cookieDomain, cookiePrefix, ses } = getApiRuntimeConfig();
const sendVerificationOTP = createOtpEmailSender({
  fromEmail: ses.fromEmail,
  environment: process.env.ENVIRONMENT,
  send: sendEmail,
  log: console,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  plugins: [
    emailProtectionPlugin,
    emailOTP({
      sendVerificationOTP,
      disableSignUp: false,
      sendVerificationOnSignUp: false,
      rateLimit: {
        window: 10 * 60,
        max: 3,
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 7,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: 'compact',
    },
  },
  baseURL: betterAuthUrl,
  advanced: {
    cookiePrefix,
    crossSubDomainCookies: {
      enabled: Boolean(cookieDomain),
      domain: cookieDomain,
    },
    defaultCookieAttributes: {
      sameSite: cookieDomain ? 'none' : 'lax',
      secure: Boolean(cookieDomain) || process.env.NODE_ENV === 'production',
      domain: cookieDomain,
      path: '/',
    },
  },
  trustedOrigins: Array.from(new Set([...allowedOrigins, frontendUrl, apiUrl, betterAuthUrl].filter(Boolean))),
});
