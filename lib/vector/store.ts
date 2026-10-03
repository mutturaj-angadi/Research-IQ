import { run, type Db } from '../db/client';
import { EMBEDDING_DIMENSION } from '../limits';
import { toVectorLiteral } from './similarity';

export interface EmbeddingRow {
  chunkId: string;
  embedding: number[];
  contentHash: string;
}

/** Upserts embeddings in one statement. Re-embedding bumps embedding_version. */
export async function storeEmbeddings(db: Db, model: string, rows: EmbeddingRow[]): Promise<void> {
  if (rows.length === 0) return;
  await run(
    db,
    `INSERT INTO chunk_embeddings (chunk_id, embedding, model, dimension, content_hash)
     SELECT u.chunk_id, u.embedding::vector, $3, $5, u.content_hash
     FROM unnest($1::uuid[], $2::text[], $4::text[]) AS u(chunk_id, embedding, content_hash)
     ON CONFLICT (chunk_id) DO UPDATE
       SET embedding = EXCLUDED.embedding,
           model = EXCLUDED.model,
           dimension = EXCLUDED.dimension,
           content_hash = EXCLUDED.content_hash,
           embedding_version = chunk_embeddings.embedding_version + 1,
           created_at = now()`,
    [
      rows.map((r) => r.chunkId),
      rows.map((r) => toVectorLiteral(r.embedding)),
      model,
      rows.map((r) => r.contentHash),
      EMBEDDING_DIMENSION,
    ],
  );
}

export interface ChunkToEmbed {
  id: string;
  paperId: string;
  content: string;
  contentHash: string;
}

/** Chunks with no embedding, an embedding from another model, or an embedding of outdated text. */
export async function findChunksNeedingEmbedding(db: Db, model: string, limit: number): Promise<ChunkToEmbed[]> {
  const rows = await run<{ id: string; paper_id: string; content: string; content_hash: string }>(
    db,
    `SELECT c.id, c.paper_id, c.content, c.content_hash
     FROM paper_chunks c
     LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id
     WHERE e.chunk_id IS NULL OR e.model <> $1 OR e.content_hash <> c.content_hash
     ORDER BY c.paper_id, c.chunk_index
     LIMIT $2`,
    [model, limit],
  );
  return rows.map((r) => ({ id: r.id, paperId: r.paper_id, content: r.content, contentHash: r.content_hash }));
}
