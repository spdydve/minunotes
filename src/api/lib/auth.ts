import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/client";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || `${FRONTEND_URL}/api/auth`;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

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
  baseURL: BETTER_AUTH_URL,
  advanced: {
    crossSubDomainCookies: {
      enabled: Boolean(COOKIE_DOMAIN),
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: COOKIE_DOMAIN,
      path: "/",
    },
  },
  trustedOrigins: [FRONTEND_URL, "http://localhost:5173", BETTER_AUTH_URL].filter(Boolean),
});
