import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/client";
import { getApiRuntimeConfig } from "./env";

const { frontendUrl, betterAuthUrl, allowedOrigins, cookieDomain } = getApiRuntimeConfig();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        console.log(`[AUTH OTP] ${type} OTP for ${email}: ${otp}`);
      },
      disableSignUp: false,
      sendVerificationOnSignUp: false,
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "compact",
    },
  },
  baseURL: betterAuthUrl,
  advanced: {
    crossSubDomainCookies: {
      enabled: Boolean(cookieDomain),
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: cookieDomain,
      path: "/",
    },
  },
  trustedOrigins: Array.from(new Set([...allowedOrigins, frontendUrl, betterAuthUrl].filter(Boolean))),
});
