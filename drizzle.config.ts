import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return {} as Record<string, string>;
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/g, ''),
        ];
      })
  );
}

const env = {
  ...loadEnvFile('.env'),
  ...loadEnvFile(`.env.${process.env.ENVIRONMENT}`),
  ...process.env,
};

const url = env.TURSO_DB_URL ?? env.LIBSQL_URL ?? 'file:local.db';
const token = env.TURSO_AUTH_TOKEN ?? env.LIBSQL_AUTH_TOKEN;

export default defineConfig({
  schema: './src/api/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: token ? { url, token } : { url },
});
