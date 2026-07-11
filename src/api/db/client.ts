import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? undefined;

export const libsql = createClient({ url, authToken });
export const db = drizzle(libsql, { schema });
