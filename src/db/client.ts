import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseUrl } from '@/lib/env';
import * as schema from './schema';

/**
 * One pool per process, created on first use rather than on import.
 *
 * Lazy on purpose: `next build` imports every route module, and a build must
 * not need production secrets. The loud "missing DATABASE_URL" error still
 * happens — on the first query, where it belongs.
 *
 * DATABASE_URL must be Neon's POOLED endpoint; web and worker together will
 * exhaust the direct one.
 */
const globalForDb = globalThis as unknown as {
  __twPool?: Pool;
  __twDb?: NodePgDatabase<typeof schema>;
};

function createPool(): Pool {
  const connectionString = databaseUrl();
  const needsSsl =
    /neon\.tech|sslmode=require/.test(connectionString) &&
    !/sslmode=disable/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__twPool) globalForDb.__twPool = createPool();
  return globalForDb.__twPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.__twDb) globalForDb.__twDb = drizzle(getPool(), { schema });
  return globalForDb.__twDb;
}

/** Forwards to the real instance on first property access. */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve() as Record<string | symbol, unknown>;
      const value = instance[property];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    has(_target, property) {
      return property in (resolve() as object);
    },
  });
}

export const pool: Pool = lazy(getPool);
export const db: NodePgDatabase<typeof schema> = lazy(getDb);
export { schema };
