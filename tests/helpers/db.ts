import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../lib/db/client';
import { sha256Hex } from '../../lib/research/upload';
import { EMBEDDING_DIMENSION } from '../../lib/limits';
import { toVectorLiteral } from '../../lib/vector/similarity';

/** DB tests run only when TEST_DATABASE_URL points at a migrated, disposable database. */
export const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
if (HAS_DB) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export { closePool, getPool };

/** Test fixture: orthogonal unit vector e_i. */
export function basisVector(i: number): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  v[i] = 1;
  return v;
}

export const basisLiteral = (i: number): string => toVectorLiteral(basisVector(i));

/** Runs `fn` inside a transaction that is always rolled back. */
export async function inRollback(fn: (c: PoolClient) => Promise<void>): Promise<void> {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

/** Runs a statement expected to violate a rule; returns the SQLSTATE and keeps the transaction usable. */
export async function sqlState(c: PoolClient, sql: string, params: unknown[] = []): Promise<string | undefined> {
  await c.query('SAVEPOINT attempt');
  try {
    await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT attempt');
    return undefined;
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT attempt');
    return (err as { code?: string }).code;
  }
}

export async function insertPaper(c: PoolClient, over: Partial<{ title: string; year: number; doi: string; venue: string }> = {}): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO papers (title, publication_year, doi, venue, file_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [over.title ?? `Test paper ${randomUUID()}`, over.year ?? 2020, over.doi ?? null, over.venue ?? null, sha256Hex(randomUUID())],
  );
  return (r.rows[0] as { id: string }).id;
}

export async function insertChunk(c: PoolClient, paperId: string, index: number, content = `chunk ${index} text`, page = 1, section = 'Introduction'): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO paper_chunks (paper_id, chunk_index, section, page_number, content, content_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [paperId, index, section, page, content, sha256Hex(content + paperId)],
  );
  return (r.rows[0] as { id: string }).id;
}

export async function insertEmbedding(c: PoolClient, chunkId: string, basis: number, model = 'test-model'): Promise<void> {
  await c.query(
    `INSERT INTO chunk_embeddings (chunk_id, embedding, model, dimension, content_hash)
     SELECT $1, $2::vector, $3, 768, content_hash FROM paper_chunks WHERE id = $1`,
    [chunkId, basisLiteral(basis), model],
  );
}
