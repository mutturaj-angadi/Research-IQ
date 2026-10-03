import type { Db } from '../client';
import { run } from '../client';
import { AppError } from '../../errors';
import type { AuthorItem, CategoryItem, Page, PaperDetail, PaperListItem } from '../../types';
import { filtersSchema, paginationSchema, parseInput, totalPages, uuidSchema } from '../../validation/schemas';
import { buildPaperFilterClause } from '../../vector/filters';

export async function listPapers(db: Db, rawPaging: unknown, rawFilters: unknown): Promise<Page<PaperListItem>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const filters = parseInput(filtersSchema, rawFilters ?? {});
  const filter = buildPaperFilterClause(filters, 3);
  const rows = await run<{
    id: string; title: string; authors: string; publication_year: number | null; venue: string | null; doi: string | null;
    processing_status: string; category_count: string; chunk_count: string; total: string;
  }>(
    db,
    `SELECT v.id, v.title, v.authors, v.publication_year, v.venue, v.doi, v.processing_status,
            v.category_count, v.chunk_count, count(*) OVER () AS total
     FROM paper_summary_view v JOIN papers p ON p.id = v.id
     WHERE true${filter.sql}
     ORDER BY v.created_at DESC, v.id LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize, ...filter.params],
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((r) => ({
      paperId: r.id, title: r.title, authors: r.authors, publicationYear: r.publication_year, venue: r.venue, doi: r.doi,
      processingStatus: r.processing_status, categoryCount: Number(r.category_count), chunkCount: Number(r.chunk_count),
    })),
    page, pageSize, total, totalPages: totalPages(total, pageSize),
  };
}

export async function listCategories(db: Db, rawPaging: unknown): Promise<Page<CategoryItem>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const rows = await run<{ id: number; name: string; paper_count: string; total: string }>(
    db,
    `SELECT c.id, c.name, count(pc.paper_id) AS paper_count, count(*) OVER () AS total
     FROM categories c LEFT JOIN paper_categories pc ON pc.category_id = c.id
     GROUP BY c.id ORDER BY c.name LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((r) => ({ categoryId: r.id, name: r.name, paperCount: Number(r.paper_count) })),
    page, pageSize, total, totalPages: totalPages(total, pageSize),
  };
}

export async function listAuthors(db: Db, rawPaging: unknown): Promise<Page<AuthorItem>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const rows = await run<{ id: string; full_name: string; paper_count: string; total: string }>(
    db,
    `SELECT a.id, a.full_name, count(pa.paper_id) AS paper_count, count(*) OVER () AS total
     FROM authors a LEFT JOIN paper_authors pa ON pa.author_id = a.id
     GROUP BY a.id ORDER BY a.normalized_name LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((r) => ({ authorId: r.id, name: r.full_name, paperCount: Number(r.paper_count) })),
    page, pageSize, total, totalPages: totalPages(total, pageSize),
  };
}

export async function getPaperById(db: Db, rawId: unknown): Promise<PaperDetail> {
  const id = parseInput(uuidSchema, rawId);
  const [p] = await run<{
    id: string; title: string; abstract: string | null; publication_year: number | null; venue: string | null; doi: string | null;
    url: string | null; language: string; citation_count: number; processing_status: PaperDetail['processingStatus']; created_at: Date;
  }>(
    db,
    `SELECT id, title, abstract, publication_year, venue, doi, url, language, citation_count, processing_status, created_at
     FROM papers WHERE id = $1`,
    [id],
  );
  if (!p) throw new AppError('NOT_FOUND', 'Paper not found');

  const authors = await run<{ id: string; full_name: string; author_order: number }>(
    db,
    `SELECT a.id, a.full_name, pa.author_order FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
     WHERE pa.paper_id = $1 ORDER BY pa.author_order`,
    [id],
  );
  const categories = await run<{ id: number; name: string }>(
    db,
    `SELECT c.id, c.name FROM paper_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.paper_id = $1 ORDER BY c.name`,
    [id],
  );
  const [s] = await run<{ chunk_count: string; embedded_chunk_count: string; times_retrieved: string; times_cited_as_evidence: string; times_saved: string }>(
    db,
    `SELECT * FROM get_paper_statistics($1)`,
    [id],
  );
  return {
    paperId: p.id, title: p.title, abstract: p.abstract, publicationYear: p.publication_year, venue: p.venue, doi: p.doi, url: p.url,
    language: p.language, citationCount: p.citation_count, processingStatus: p.processing_status,
    authors: authors.map((a) => ({ authorId: a.id, name: a.full_name, order: a.author_order })),
    categories: categories.map((c) => ({ categoryId: c.id, name: c.name })),
    stats: {
      chunkCount: Number(s?.chunk_count ?? 0), embeddedChunkCount: Number(s?.embedded_chunk_count ?? 0),
      timesRetrieved: Number(s?.times_retrieved ?? 0), timesCitedAsEvidence: Number(s?.times_cited_as_evidence ?? 0),
      timesSaved: Number(s?.times_saved ?? 0),
    },
    createdAt: p.created_at.toISOString(),
  };
}

export async function savePaperForUser(db: Db, userId: string, rawPaperId: unknown): Promise<{ saved: true; alreadySaved: boolean }> {
  const paperId = parseInput(uuidSchema, rawPaperId);
  const exists = await run(db, `SELECT 1 FROM papers WHERE id = $1`, [paperId]);
  if (exists.length === 0) throw new AppError('NOT_FOUND', 'Paper not found');
  const inserted = await run(
    db,
    `INSERT INTO saved_papers (user_id, paper_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING paper_id`,
    [userId, paperId],
  );
  return { saved: true, alreadySaved: inserted.length === 0 };
}
