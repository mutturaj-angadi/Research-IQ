import { closePool, getPool } from '../lib/db/client';
import { errorFields, logger } from '../lib/logger';
import { createEmbeddingService } from '../lib/vector/embeddings';
import { reembedStale } from '../lib/vector/lifecycle';

/** Embeds every chunk that has no embedding, or whose embedding is from another model or outdated text. */
async function main(): Promise<void> {
  const summary = await reembedStale(getPool(), createEmbeddingService());
  logger.info('embed.done', { ...summary });
}

main()
  .catch((err) => {
    logger.error('embed.failed', errorFields(err));
    process.exitCode = 1;
  })
  .finally(closePool);
