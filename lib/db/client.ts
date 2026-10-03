import pg from 'pg';
import type { Pool as PgPool, QueryResult, QueryResultRow } from 'pg';
import { getConfig } from '../config';
import { errorFields, logger } from '../logger';
import { fromDbError } from '../errors';

/** Anything that can run a query: a Pool or a checked-out transaction client. */
export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

let pool: PgPool | undefined;

export function getPool(): PgPool {
  if (!pool) {
    const config = getConfig();
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    });
    pool.on('error', (err) => logger.error('db.pool_error', errorFields(err)));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Runs a parameterised query and returns rows. All SQL values must be passed through `params`. */
export async function run<R extends QueryResultRow>(db: Db, text: string, params: unknown[] = []): Promise<R[]> {
  try {
    const result = await db.query<R>(text, params);
    return result.rows;
  } catch (err) {
    const mapped = fromDbError(err);
    logger.error('db.query_failed', { ...errorFields(err), appCode: mapped.code });
    throw mapped;
  }
}
