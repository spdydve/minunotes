import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

const apiUrl = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
const baseURL = `${apiUrl}/auth`;

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});
