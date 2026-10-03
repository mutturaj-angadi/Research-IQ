import type { Pool as PgPool } from 'pg';
import { AppError, fromDbError } from '../../errors';
import { getPool, type Db } from '../client';

/** Runs `fn` inside BEGIN/COMMIT on one connection; any error triggers ROLLBACK and is mapped to an AppError. */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>, pool: PgPool = getPool()): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err instanceof AppError ? err : fromDbError(err);
  } finally {
    client.release();
  }
}
