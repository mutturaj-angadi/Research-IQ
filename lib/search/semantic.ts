import type { Pool as PgPool } from 'pg';
import { run, type Db } from '../db/client';
import { withTransaction } from '../db/transactions/withTransaction';
import { AppError } from '../errors';
import { errorFields, logger } from '../logger';
import type { SemanticSearchResponse, SemanticSearchResult } from '../types';
import type { EmbeddingService } from '../vector/embeddings';
import { buildPaperFilterClause } from '../vector/filters';
import { toVectorLiteral } from '../vector/similarity';
import { parseInput, semanticSearchSchema, type SemanticSearchInput } from '../validation/schemas';

interface Row {
  chunk_id: string;
  paper_id: string;
  paper_title: string;
  publication_year: number | null;
  venue: string | null;
  section: string | null;
  page_number: number | null;
  snippet: string;
  content: string;
  similarity: number;
  authors: string[];
}

/** Raises recall for filtered HNSW scans; iterative scan needs pgvector >= 0.8 and is skipped otherwise. */
async function tuneHnsw(tx: Db): Promise<void> {
  await tx.query(`SELECT set_config('hnsw.ef_search', '100', true)`);
  await tx.query('SAVEPOINT hnsw_iter');
  try {
    await tx.query(`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`);
    await tx.query('RELEASE SAVEPOINT hnsw_iter');
  } catch {
    await tx.query('ROLLBACK TO SAVEPOINT hnsw_iter');
  }
}

export class SemanticSearchService {
  constructor(private readonly deps: { db: PgPool; embeddings: EmbeddingService }) {}

  /** Validates input, embeds the query, runs a filtered cosine top-K search and returns real chunks only. */
  async search(raw: unknown): Promise<SemanticSearchResponse> {
    const input = parseInput(semanticSearchSchema, raw);
    const queryVector = await this.deps.embeddings.embed(input.query);
    try {
      const results = await withTransaction(async (tx) => {
        await tuneHnsw(tx);
        return this.query(tx, toVectorLiteral(queryVector), input);
      }, this.deps.db);
      return { query: input.query, topK: input.topK, results, noEvidence: results.length === 0 };
    } catch (err) {
      logger.error('search.vector_failed', errorFields(err));
      if (err instanceof AppError && err.code === 'DATABASE_ERROR') {
        throw new AppError('VECTOR_SEARCH_ERROR', 'Semantic search is temporarily unavailable', undefined, { cause: err });
      }
      throw err;
    }
  }

  private async query(tx: Db, vector: string, input: SemanticSearchInput): Promise<SemanticSearchResult[]> {
    const filter = buildPaperFilterClause(input.filters, 7);
    const innerLimit = Math.min(input.topK * input.maxChunksPerPaper, 100);
    const rows = await run<Row>(
      tx,
      `WITH nearest AS MATERIALIZED (
         SELECT c.id AS chunk_id, c.paper_id, c.section, c.page_number, c.content,
                e.embedding <=> $1::vector AS distance
         FROM chunk_embeddings e
         JOIN paper_chunks c ON c.id = e.chunk_id
         JOIN papers p ON p.id = c.paper_id
         WHERE e.model = $2 AND p.processing_status = 'COMPLETED'${filter.sql}
         ORDER BY e.embedding <=> $1::vector
         LIMIT $3
       ), ranked AS (
         SELECT n.*, row_number() OVER (PARTITION BY n.paper_id ORDER BY n.distance) AS rn FROM nearest n
       )
       SELECT r.chunk_id, r.paper_id, p.title AS paper_title, p.publication_year, p.venue,
              r.section, r.page_number, left(r.content, 500) AS snippet, r.content,
              1 - r.distance AS similarity,
              COALESCE((SELECT array_agg(a.full_name ORDER BY pa.author_order)
                        FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
                        WHERE pa.paper_id = r.paper_id), '{}') AS authors
       FROM ranked r
       JOIN papers p ON p.id = r.paper_id
       WHERE r.rn <= $4 AND 1 - r.distance >= $5
       ORDER BY r.distance, r.chunk_id
       LIMIT $6`,
      [vector, this.deps.embeddings.model, innerLimit, input.maxChunksPerPaper, input.minSimilarity, input.topK, ...filter.params],
    );
    return rows.map((r) => ({
      paperId: r.paper_id,
      paperTitle: r.paper_title,
      chunkId: r.chunk_id,
      similarity: Number(r.similarity),
      snippet: r.snippet,
      content: r.content,
      pageNumber: r.page_number,
      section: r.section,
      authors: r.authors,
      publicationYear: r.publication_year,
      venue: r.venue,
    }));
  }
}
