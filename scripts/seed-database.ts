import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../lib/db/client';
import { errorFields, logger } from '../lib/logger';
import { createEmbeddingService } from '../lib/vector/embeddings';
import { reembedStale } from '../lib/vector/lifecycle';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'seed.sql');

/** Loads database/seed.sql (idempotent), then embeds the seeded chunks unless --no-embed is passed. */
async function main(): Promise<void> {
  const pool = getPool();
  await pool.query(await readFile(seedFile, 'utf8'));
  logger.info('seed.sql_loaded');
  if (process.argv.includes('--no-embed')) return;
  const summary = await reembedStale(pool, createEmbeddingService());
  logger.info('seed.embedded', { ...summary });
}

main()
  .catch((err) => {
    logger.error('seed.failed', errorFields(err));
    process.exitCode = 1;
  })
  .finally(closePool);
