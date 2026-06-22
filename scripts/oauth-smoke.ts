import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const baseUrl = (process.env.MINUNOTES_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const clientId = process.env.MINUNOTES_OAUTH_CLIENT_ID;
const redirectUri = process.env.MINUNOTES_OAUTH_REDIRECT_URI ?? "https://example.com/minunotes-oauth-callback";
const scope = process.env.MINUNOTES_OAUTH_SCOPE ?? "notes";

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function readLine(prompt: string) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  if (!clientId) {
    console.error("Missing MINUNOTES_OAUTH_CLIENT_ID.");
    console.error("Create an app in Settings → API Access → Apps, then run:");
    console.error("MINUNOTES_OAUTH_CLIENT_ID=<client_id> pnpm oauth:smoke");
    process.exit(1);
  }

  const verifier = randomBytes(48).toString("base64url");
  const authorizeUrl = new URL(`${baseUrl}/api/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge", pkceChallenge(verifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", randomBytes(12).toString("hex"));

  console.log("\nOpen this URL while logged into MinuNotes:\n");
  console.log(authorizeUrl.toString());
  console.log("\nApprove access. The redirect target may show a browser error; copy the full final URL from the address bar.\n");

  const callbackUrl = await readLine("Final redirect URL: ");
  const code = new URL(callbackUrl).searchParams.get("code");
  if (!code) throw new Error("No code parameter found in callback URL");

  const tokenResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  const tokenBody = await tokenResponse.json() as { access_token?: string; token_type?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenBody)}`);
  }

  console.log(`\nToken exchange OK (${tokenBody.token_type ?? "Bearer"}). Calling harness...`);
  const foldersResponse = await fetch(`${baseUrl}/api/harness/folders`, {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  const foldersBody = await foldersResponse.json() as { folders?: Array<{ id: string; title: string }>; error?: string };
  if (!foldersResponse.ok) throw new Error(`Harness call failed: ${JSON.stringify(foldersBody)}`);

  console.log(`Harness OK. Visible folders: ${foldersBody.folders?.length ?? 0}`);
  for (const folder of foldersBody.folders?.slice(0, 10) ?? []) {
    console.log(`- ${folder.title} (${folder.id})`);
  }
  console.log("\nOAuth smoke test complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
