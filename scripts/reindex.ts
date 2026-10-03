import { closePool, getPool } from '../lib/db/client';
import { errorFields, logger } from '../lib/logger';
import { createEmbeddingService } from '../lib/vector/embeddings';
import { reembedStale } from '../lib/vector/lifecycle';

/** Re-embeds stale chunks (e.g. after changing EMBEDDING_MODEL), then rebuilds the HNSW index. */
async function main(): Promise<void> {
  const pool = getPool();
  const summary = await reembedStale(pool, createEmbeddingService());
  await pool.query('REINDEX INDEX idx_chunk_embeddings_hnsw');
  logger.info('reindex.done', { ...summary });
}

main()
  .catch((err) => {
    logger.error('reindex.failed', errorFields(err));
    process.exitCode = 1;
  })
  .finally(closePool);
