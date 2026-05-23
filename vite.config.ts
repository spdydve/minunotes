import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

async function getSstApiUrl() {
  try {
    const { Resource } = await import("sst");
    return (Resource as { ApiGateway?: { url?: string }; Api?: { url?: string } }).ApiGateway?.url ?? (Resource as { Api?: { url?: string } }).Api?.url;
  } catch {
    return undefined;
  }
}

export default defineConfig(async ({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const apiTarget = env.VITE_API_PROXY_TARGET || await getSstApiUrl();

  console.log(`[vite] Proxy target: ${apiTarget}`);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: apiTarget && apiTarget !== "/api"
        ? {
            "/api": {
              target: apiTarget.replace(/\/$/, ""),
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
  };
});
