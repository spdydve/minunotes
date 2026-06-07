import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

const configuredApiUrl = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
const apiUrl = configuredApiUrl.startsWith("http")
  ? configuredApiUrl
  : `${window.location.origin}${configuredApiUrl}`;
const baseURL = `${apiUrl}/auth`;

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});
