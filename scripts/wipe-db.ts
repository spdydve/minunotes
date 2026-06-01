import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

const environment = process.env.ENVIRONMENT ?? "local";
loadEnvFile(".env");
loadEnvFile(`.env.${environment}`);
loadEnvFile(".env.local");

const yes = process.argv.includes("--yes");
const forceProduction = process.argv.includes("--force-production");
const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;

if (!yes) {
  console.error("Refusing to wipe DB without --yes.");
  process.exit(1);
}

if (environment === "production" && !forceProduction) {
  console.error("Refusing to wipe production without --force-production.");
  process.exit(1);
}

console.log("Wiping database");
console.log(`Environment: ${environment}`);
console.log(`Target: ${url}`);

const client = createClient({ url, authToken });

try {
  await client.execute("PRAGMA foreign_keys = OFF");
  const result = await client.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
  const objects = result.rows.map((row) => ({ name: String(row.name), type: String(row.type) }));

  if (objects.length === 0) {
    console.log("Database is already empty.");
  }

  for (const object of objects) {
    console.log(`Dropping ${object.type}: ${object.name}`);
    await client.execute(`DROP ${object.type.toUpperCase()} IF EXISTS "${object.name.replaceAll('"', '""')}"`);
  }

  await client.execute("PRAGMA foreign_keys = ON");
  console.log("Database wiped successfully.");
} catch (error) {
  console.error("Database wipe failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.close();
}
