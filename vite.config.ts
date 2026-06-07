import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

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
    root: "apps/web",
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
    },
    test: {
      root: process.cwd(),
      include: ["tests/**/*.test.ts", "packages/**/*.test.ts"],
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: [
        "@codemirror/autocomplete",
        "@codemirror/commands",
        "@codemirror/lang-css",
        "@codemirror/lang-html",
        "@codemirror/lang-javascript",
        "@codemirror/lang-json",
        "@codemirror/lang-markdown",
        "@codemirror/lang-python",
        "@codemirror/lang-sql",
        "@codemirror/lang-yaml",
        "@codemirror/language",
        "@codemirror/legacy-modes",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/highlight",
      ],
    },
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
