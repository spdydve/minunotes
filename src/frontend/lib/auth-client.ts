import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

const baseURL = `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});
