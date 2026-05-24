/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "notes-2",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const isLocal = $app.stage === "davidkennedy" || $app.stage === "local";

    const apiGateway = new sst.aws.ApiGatewayV2("ApiGateway", {
      cors: {
        allowOrigins: isLocal ? ["http://localhost:5173"] : ["*"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        allowCredentials: true,
      },
    });

    const api = new sst.aws.Function("Api", {
      handler: "src/api/index.handler",
      nodejs: {
        install: ["@libsql/client", "libsql"],
      },
      environment: {
        LIBSQL_URL: process.env.LIBSQL_URL ?? "file:local.db",
        LIBSQL_AUTH_TOKEN: process.env.LIBSQL_AUTH_TOKEN ?? "",
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173/api/auth",
        FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",
        COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? "",
      },
    });

    apiGateway.route("ANY /", api.arn);
    apiGateway.route("ANY /{proxy+}", api.arn);

    new sst.aws.StaticSite("Web", {
      path: ".",
      dev: {
        command: "pnpm dev:web",
        url: "http://localhost:5173",
      },
      build: {
        command: "pnpm build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: "/api",
        VITE_API_PROXY_TARGET: apiGateway.url,
      },
    });
  },
});
