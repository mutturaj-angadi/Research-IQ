import type { Db } from '../db/client';
import { run } from '../db/client';
import { withTransaction } from '../db/transactions/withTransaction';
import type { HistoryItem, Page } from '../types';
import { paginationSchema, parseInput, totalPages } from '../validation/schemas';

export interface SearchLogEntry {
  userId: string;
  query: string;
  type: 'KEYWORD' | 'SEMANTIC';
  filters: unknown;
  results: { paperId: string; chunkId: string | null; score: number }[];
}

/** Stores the query and its ranked results atomically. Contains no secrets, only what the user searched for. */
export async function recordSearch(entry: SearchLogEntry): Promise<string> {
  return withTransaction(async (tx) => {
    const [row] = await run<{ id: string }>(
      tx,
      `INSERT INTO search_queries (user_id, query_text, search_type, filters, result_count)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
      [entry.userId, entry.query, entry.type, JSON.stringify(entry.filters ?? {}), entry.results.length],
    );
    const id = (row as { id: string }).id;
    if (entry.results.length > 0) {
      await run(
        tx,
        `INSERT INTO search_results (search_query_id, paper_id, chunk_id, rank, score)
         SELECT $1::uuid, u.paper_id, u.chunk_id, u.rank, u.score
         FROM unnest($2::uuid[], $3::uuid[], $4::int[], $5::float8[]) AS u(paper_id, chunk_id, rank, score)`,
        [
          id,
          entry.results.map((r) => r.paperId),
          entry.results.map((r) => r.chunkId),
          entry.results.map((_, i) => i + 1),
          entry.results.map((r) => r.score),
        ],
      );
    }
    return id;
  });
}

export async function listHistory(db: Db, userId: string, rawPaging: unknown): Promise<Page<HistoryItem>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const [counts] = await run<{ total: string }>(
    db,
    `SELECT (SELECT count(*) FROM search_queries WHERE user_id = $1) + (SELECT count(*) FROM questions WHERE user_id = $1) AS total`,
    [userId],
  );
  const rows = await run<{ kind: 'SEARCH' | 'QUESTION'; id: string; text: string; created_at: Date; result_count: number | null }>(
    db,
    `SELECT * FROM (
       SELECT 'SEARCH'::text AS kind, id, query_text AS text, created_at, result_count FROM search_queries WHERE user_id = $1
       UNION ALL
       SELECT 'QUESTION'::text, id, question_text, created_at, NULL::int FROM questions WHERE user_id = $1
     ) h ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  const total = Number(counts?.total ?? 0);
  return {
    items: rows.map((r) => ({ kind: r.kind, id: r.id, text: r.text, createdAt: r.created_at.toISOString(), resultCount: r.result_count })),
    page,
    pageSize,
    total,
    totalPages: totalPages(total, pageSize),
  };
}
