/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "minunotes",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: process.env.AWS_PROFILE || "dpklabs",
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    const { getStageUrls, parseAllowedOrigins } =
      await import("./src/api/lib/env");
    const isLocal = $app.stage === "davidkennedy" || $app.stage === "local";
    const { frontendUrl, betterAuthUrl } = getStageUrls($app.stage);
    const allowOrigins = parseAllowedOrigins(
      process.env.API_ALLOWED_ORIGINS,
      frontendUrl,
    );

    const attachmentStorageDriver = "s3";
    // const attachmentStorageDriver = process.env.ATTACHMENT_STORAGE_DRIVER ?? (isLocal ? "filesystem" : "s3");
    const attachmentsBucket = new sst.aws.Bucket("Attachments", {
      cors: {
        allowOrigins,
        allowMethods: ["PUT", "GET", "HEAD"],
        allowHeaders: ["Content-Type"],
        exposeHeaders: ["ETag"],
        maxAge: "1 day",
      },
    });

    const apiGateway = new sst.aws.ApiGatewayV2("ApiGateway", {
      cors: {
        allowOrigins,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
        allowCredentials: true,
      },
    });

    const api = new sst.aws.Function("Api", {
      handler: "src/api/index.handler",
      nodejs: {
        install: [
          "@aws-sdk/client-s3",
          "@aws-sdk/s3-request-presigner",
          "@libsql/client",
          "libsql",
        ],
      },
      link: [attachmentsBucket],
      environment: {
        LIBSQL_URL: process.env.LIBSQL_URL ?? "file:local.db",
        LIBSQL_AUTH_TOKEN: process.env.LIBSQL_AUTH_TOKEN ?? "",
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
        BETTER_AUTH_URL: betterAuthUrl,
        FRONTEND_URL: frontendUrl,
        API_ALLOWED_ORIGINS: allowOrigins.join(","),
        COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? "",
        ATTACHMENT_STORAGE_DRIVER: attachmentStorageDriver,
        ATTACHMENT_STORAGE_PATH:
          process.env.ATTACHMENT_STORAGE_PATH ?? ".notes-attachments",
        ATTACHMENT_PUBLIC_BASE_URL:
          process.env.ATTACHMENT_PUBLIC_BASE_URL ?? "",
        ATTACHMENT_BUCKET:
          process.env.ATTACHMENT_BUCKET ?? attachmentsBucket.name,
        ATTACHMENT_REGION:
          process.env.ATTACHMENT_REGION ?? process.env.AWS_REGION ?? "",
        ATTACHMENT_ENDPOINT: process.env.ATTACHMENT_ENDPOINT ?? "",
        ATTACHMENT_FORCE_PATH_STYLE:
          process.env.ATTACHMENT_FORCE_PATH_STYLE ?? "false",
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
