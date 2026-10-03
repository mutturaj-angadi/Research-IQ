import { getConfig } from '../config';
import type { Db } from '../db/client';
import { run } from '../db/client';
import { errorFields, logger } from '../logger';
import { AppError } from '../errors';
import type { EmbeddingService } from './embeddings';
import { findChunksNeedingEmbedding, storeEmbeddings, type ChunkToEmbed } from './store';

/**
 * Embeds chunks batch by batch. Each batch is stored with its own statement, so no SQL transaction
 * is held open during the external API call and a failure keeps the batches that already succeeded.
 */
export async function embedChunks(db: Db, embeddings: EmbeddingService, chunks: ChunkToEmbed[]): Promise<number> {
  const batchSize = getConfig().EMBEDDING_BATCH_SIZE;
  let stored = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await embeddings.embedBatch(batch.map((c) => c.content));
    await storeEmbeddings(
      db,
      embeddings.model,
      batch.map((c, j) => ({ chunkId: c.id, embedding: vectors[j] as number[], contentHash: c.contentHash })),
    );
    stored += batch.length;
  }
  return stored;
}

export async function markPaperFailed(db: Db, paperId: string, err: unknown): Promise<void> {
  const message = err instanceof AppError ? `${err.code}: ${err.message}` : 'INTERNAL_ERROR: processing failed';
  await run(db, `UPDATE papers SET processing_status = 'FAILED', processing_error = $2 WHERE id = $1`, [paperId, message.slice(0, 500)]);
}

/** The database trigger rejects this if any chunk lacks an embedding. */
export async function markPaperCompleted(db: Db, paperId: string): Promise<void> {
  await run(db, `UPDATE papers SET processing_status = 'COMPLETED', processing_error = NULL WHERE id = $1`, [paperId]);
}

export interface ReembedSummary {
  embeddedChunks: number;
  completedPapers: number;
}

/** Re-embeds every stale or missing chunk and completes papers that are now fully embedded. */
export async function reembedStale(db: Db, embeddings: EmbeddingService, pageSize = 500): Promise<ReembedSummary> {
  let embeddedChunks = 0;
  const touched = new Set<string>();
  for (;;) {
    const chunks = await findChunksNeedingEmbedding(db, embeddings.model, pageSize);
    if (chunks.length === 0) break;
    try {
      embeddedChunks += await embedChunks(db, embeddings, chunks);
    } catch (err) {
      logger.error('embedding.reembed_failed', errorFields(err));
      for (const id of new Set(chunks.map((c) => c.paperId))) await markPaperFailed(db, id, err);
      throw err;
    }
    chunks.forEach((c) => touched.add(c.paperId));
  }
  let completedPapers = 0;
  for (const paperId of touched) {
    await markPaperCompleted(db, paperId);
    completedPapers++;
  }
  return { embeddedChunks, completedPapers };
}
