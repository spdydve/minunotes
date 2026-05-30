import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? "file:local.db";
const token = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;

export default defineConfig({
  schema: "./src/api/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: token ? { url, token } : { url },
});
