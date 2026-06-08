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
    const { existsSync, readFileSync } = await import("node:fs");

    const loadEnvFile = (path: string) => {
      if (!existsSync(path)) return {} as Record<string, string>;
      return Object.fromEntries(
        readFileSync(path, "utf8")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#") && line.includes("="))
          .map((line) => {
            const index = line.indexOf("=");
            const key = line.slice(0, index).trim();
            const value = line
              .slice(index + 1)
              .trim()
              .replace(/^['\"]|['\"]$/g, "");
            return [key, value];
          }),
      );
    };

    const env = {
      ...loadEnvFile(".env"),
      ...loadEnvFile(`.env.${process.env.ENVIRONMENT}`),
      ...process.env,
    };

    const requireCustomDomainCert = (name: string, value?: string) => {
      if (value?.trim()) return value;
      throw new Error(
        `${name} is required for ${$app.stage} custom domains. Set it in .env.${env.ENVIRONMENT} or export it before deploy.`,
      );
    };

    const stage = $app.stage;
    const isProduction = stage === "production";
    const isDev = stage === "dev";
    const isLocal = !isProduction && !isDev;

    const domains = {
      dev: {
        web: "dev-notes.dpklabs.com",
        api: "api-dev-notes.dpklabs.com",
        cookieDomain: "dpklabs.com",
        cookiePrefix: "minunotes-dev",
      },
      production: {
        web: "notes.dpklabs.com",
        api: "api.notes.dpklabs.com",
        cookieDomain: "notes.dpklabs.com",
        cookiePrefix: "minunotes",
      },
    };

    const stageDomains = isLocal
      ? undefined
      : domains[stage as keyof typeof domains];

    const { frontendUrl, apiUrl, betterAuthUrl } = getStageUrls($app.stage, {
      ...env,
      FRONTEND_URL:
        env.FRONTEND_URL ??
        (stageDomains ? `https://${stageDomains.web}` : undefined),
      API_URL:
        env.API_URL ??
        (stageDomains ? `https://${stageDomains.api}` : undefined),
      BETTER_AUTH_URL:
        env.BETTER_AUTH_URL ??
        (stageDomains ? `https://${stageDomains.api}/api/auth` : undefined),
    });
    const allowOrigins = parseAllowedOrigins(
      env.API_ALLOWED_ORIGINS,
      frontendUrl,
    );

    const attachmentStorageDriver =
      env.ATTACHMENT_STORAGE_DRIVER ?? (isLocal ? "filesystem" : "s3");
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
      domain:
        !isLocal && stageDomains
          ? {
              name: stageDomains.api,
              dns: false,
              cert: requireCustomDomainCert("API_CERT_ARN", env.API_CERT_ARN),
            }
          : undefined,
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
          "@aws-sdk/client-sesv2",
          "@aws-sdk/s3-request-presigner",
          "@libsql/client",
          "libsql",
        ],
      },
      link: [attachmentsBucket],
      permissions: [
        {
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        },
      ],
      environment: {
        TURSO_DB_URL: env.TURSO_DB_URL ?? env.LIBSQL_URL ?? "file:local.db",
        TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN ?? env.LIBSQL_AUTH_TOKEN ?? "",
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
        BETTER_AUTH_URL: betterAuthUrl,
        FRONTEND_URL: frontendUrl,
        API_URL: apiUrl,
        API_ALLOWED_ORIGINS: allowOrigins.join(","),
        COOKIE_DOMAIN: env.COOKIE_DOMAIN ?? stageDomains?.cookieDomain ?? "",
        COOKIE_PREFIX:
          env.COOKIE_PREFIX ?? stageDomains?.cookiePrefix ?? "minunotes-local",
        ALLOWED_LOGIN_EMAILS: env.ALLOWED_LOGIN_EMAILS ?? "",
        SES_FROM_EMAIL: env.SES_FROM_EMAIL ?? "",
        SES_REGION: env.SES_REGION ?? env.AWS_REGION ?? "us-east-1",
        ATTACHMENT_STORAGE_DRIVER: attachmentStorageDriver,
        ATTACHMENT_STORAGE_PATH:
          env.ATTACHMENT_STORAGE_PATH ?? ".notes-attachments",
        ATTACHMENT_PUBLIC_BASE_URL: env.ATTACHMENT_PUBLIC_BASE_URL ?? "",
        ATTACHMENT_BUCKET: env.ATTACHMENT_BUCKET ?? attachmentsBucket.name,
        ATTACHMENT_REGION: env.ATTACHMENT_REGION ?? env.AWS_REGION ?? "",
        ATTACHMENT_ENDPOINT: env.ATTACHMENT_ENDPOINT ?? "",
        ATTACHMENT_FORCE_PATH_STYLE: env.ATTACHMENT_FORCE_PATH_STYLE ?? "false",
      },
    });

    apiGateway.route("ANY /", api.arn);
    apiGateway.route("ANY /{proxy+}", api.arn);

    if (!isLocal) {
      new sst.aws.Cron("AttachmentCleanup", {
        schedule: (env.ATTACHMENT_CLEANUP_SCHEDULE ?? "rate(1 day)") as
          | `rate(${string})`
          | `cron(${string})`,
        function: {
          handler: "src/api/attachments/cleanup-handler.handler",
          nodejs: {
            install: ["@aws-sdk/client-s3", "@libsql/client", "libsql"],
          },
          link: [attachmentsBucket],
          environment: {
            TURSO_DB_URL: env.TURSO_DB_URL ?? env.LIBSQL_URL ?? "file:local.db",
            TURSO_AUTH_TOKEN:
              env.TURSO_AUTH_TOKEN ?? env.LIBSQL_AUTH_TOKEN ?? "",
            ATTACHMENT_STORAGE_DRIVER: attachmentStorageDriver,
            ATTACHMENT_STORAGE_PATH:
              env.ATTACHMENT_STORAGE_PATH ?? ".notes-attachments",
            ATTACHMENT_BUCKET: env.ATTACHMENT_BUCKET ?? attachmentsBucket.name,
            ATTACHMENT_REGION: env.ATTACHMENT_REGION ?? env.AWS_REGION ?? "",
            ATTACHMENT_ENDPOINT: env.ATTACHMENT_ENDPOINT ?? "",
            ATTACHMENT_FORCE_PATH_STYLE:
              env.ATTACHMENT_FORCE_PATH_STYLE ?? "false",
            ATTACHMENT_CLEANUP_GRACE_DAYS:
              env.ATTACHMENT_CLEANUP_GRACE_DAYS ?? "30",
          },
        },
      });
    }

    const web = new sst.aws.StaticSite("Web", {
      path: ".",
      domain:
        !isLocal && stageDomains
          ? {
              name: stageDomains.web,
              dns: false,
              cert: requireCustomDomainCert("WEB_CERT_ARN", env.WEB_CERT_ARN),
            }
          : undefined,
      dev: {
        command: "pnpm dev:web",
        url: "http://localhost:5173",
      },
      build: {
        command: "pnpm build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: isLocal ? "/api" : `${apiUrl}/api`,
        VITE_API_PROXY_TARGET: apiGateway.url,
      },
    });

    return {
      webUrl: web.url,
      webDnsName: stageDomains
        ? web.nodes.cdn!.nodes.distribution.domainName
        : "",
      apiUrl: apiGateway.url,
      apiDnsName: stageDomains
        ? apiGateway.nodes.domainName.domainNameConfiguration.apply(
            (configuration) => configuration.targetDomainName,
          )
        : "",
    };
  },
});
