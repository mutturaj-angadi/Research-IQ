import type { Db } from '../db/client';
import { run } from '../db/client';
import type { PaperSearchHit, Page } from '../types';
import { buildPaperFilterClause } from '../vector/filters';
import { keywordSearchSchema, parseInput, totalPages } from '../validation/schemas';

interface Row {
  id: string;
  title: string;
  publication_year: number | null;
  venue: string | null;
  doi: string | null;
  rank: number;
  snippet: string;
  authors: string[];
  total: string;
}

/**
 * PostgreSQL full-text search. Paper-level matches use the weighted title(A)/abstract(B) vector;
 * chunk-level matches count at half weight. websearch_to_tsquery accepts arbitrary user text safely.
 */
export async function searchPapersKeyword(db: Db, raw: unknown): Promise<Page<PaperSearchHit>> {
  const input = parseInput(keywordSearchSchema, raw);
  const filter = buildPaperFilterClause(input.filters, 4);
  const rows = await run<Row>(
    db,
    `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq),
     hits AS (
       SELECT p.id AS paper_id, ts_rank_cd(p.search_vector, q.tsq) AS rank
       FROM papers p, q WHERE p.search_vector @@ q.tsq
       UNION ALL
       SELECT c.paper_id, ts_rank_cd(c.search_vector, q.tsq) * 0.5::real
       FROM paper_chunks c, q WHERE c.search_vector @@ q.tsq
     ), scored AS (
       SELECT paper_id, max(rank) AS rank FROM hits GROUP BY paper_id
     )
     SELECT p.id, p.title, p.publication_year, p.venue, p.doi, s.rank,
            ts_headline('english', COALESCE(p.abstract, p.title), q.tsq,
                        'MaxFragments=1, MaxWords=35, MinWords=15') AS snippet,
            COALESCE((SELECT array_agg(a.full_name ORDER BY pa.author_order)
                      FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
                      WHERE pa.paper_id = p.id), '{}') AS authors,
            count(*) OVER () AS total
     FROM scored s
     JOIN papers p ON p.id = s.paper_id
     CROSS JOIN q
     WHERE true${filter.sql}
     ORDER BY s.rank DESC, p.id
     LIMIT $2 OFFSET $3`,
    [input.query, input.pageSize, (input.page - 1) * input.pageSize, ...filter.params],
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((r) => ({
      paperId: r.id,
      title: r.title,
      authors: r.authors,
      publicationYear: r.publication_year,
      venue: r.venue,
      doi: r.doi,
      rank: Number(r.rank),
      snippet: r.snippet,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: totalPages(total, input.pageSize),
  };
}
