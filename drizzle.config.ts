import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/api/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: process.env.LIBSQL_AUTH_TOKEN
    ? { url: process.env.LIBSQL_URL ?? "file:local.db", token: process.env.LIBSQL_AUTH_TOKEN }
    : { url: process.env.LIBSQL_URL ?? "file:local.db" },
});
