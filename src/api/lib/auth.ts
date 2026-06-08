import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/client";
import { sendEmail } from "./email";
import { getApiRuntimeConfig } from "./env";

const {
  frontendUrl,
  apiUrl,
  betterAuthUrl,
  allowedOrigins,
  cookieDomain,
  cookiePrefix,
  allowedLoginEmails,
  ses,
} = getApiRuntimeConfig();

function isAllowedLoginEmail(email: string) {
  if (allowedLoginEmails.length === 0) return true;
  return allowedLoginEmails.includes(email.trim().toLowerCase());
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (!isAllowedLoginEmail(email)) {
          console.warn(
            `[AUTH OTP] blocked ${type} OTP for unauthorized email: ${email}`,
          );
          return;
        }

        if (!ses.fromEmail) {
          console.log(`[AUTH OTP] ${type} OTP for ${email}: ${otp}`);
          return;
        }

        await sendEmail({
          to: email,
          from: ses.fromEmail,
          subject: "Your MinuNotes login code",
          html: `<p>Your MinuNotes verification code is: <strong>${otp}</strong></p><p>This code will expire soon.</p>`,
          text: `Your MinuNotes verification code is: ${otp}\n\nThis code will expire soon.`,
        });
      },
      disableSignUp: false,
      sendVerificationOnSignUp: false,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 7,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "compact",
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
      sameSite: cookieDomain ? "none" : "lax",
      secure: Boolean(cookieDomain) || process.env.NODE_ENV === "production",
      domain: cookieDomain,
      path: "/",
    },
  },
  trustedOrigins: Array.from(
    new Set(
      [...allowedOrigins, frontendUrl, apiUrl, betterAuthUrl].filter(Boolean),
    ),
  ),
});
