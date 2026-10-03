/**
 * Member 2 database/application integration: user-scoped and admin queries that Member 1's contract
 * does not cover. All SQL is parameterised; every user-scoped query filters on the caller's id.
 */
import { z } from 'zod';
import { getPool, run } from '../db/client';
import { AppError } from '../errors';
import type { Page, PaperListItem } from '../types';
import { paginationSchema, parseInput, totalPages, uuidSchema } from '../validation/schemas';
import { categoryBodySchema, processingQuerySchema } from '../validation/app';

const db = () => getPool();
const uuidlessId = z.coerce.number().int().positive(); // categories use integer ids
const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items, page, pageSize, total, totalPages: totalPages(total, pageSize),
});

// ---------------- saved papers (user-scoped) ----------------
export async function listSavedPapers(userId: string, rawPaging: unknown): Promise<Page<PaperListItem & { savedAt: string }>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const rows = await run<{
    id: string; title: string; authors: string; publication_year: number | null; venue: string | null; doi: string | null;
    processing_status: string; category_count: string; chunk_count: string; saved_at: Date; total: string;
  }>(
    db(),
    `SELECT v.id, v.title, v.authors, v.publication_year, v.venue, v.doi, v.processing_status, v.category_count, v.chunk_count,
            sp.created_at AS saved_at, count(*) OVER () AS total
     FROM saved_papers sp JOIN paper_summary_view v ON v.id = sp.paper_id
     WHERE sp.user_id = $1 ORDER BY sp.created_at DESC, v.id LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  return pageOf(
    rows.map((r) => ({
      paperId: r.id, title: r.title, authors: r.authors, publicationYear: r.publication_year, venue: r.venue, doi: r.doi,
      processingStatus: r.processing_status, categoryCount: Number(r.category_count), chunkCount: Number(r.chunk_count),
      savedAt: r.saved_at.toISOString(),
    })),
    Number(rows[0]?.total ?? 0), page, pageSize,
  );
}

export async function unsavePaper(userId: string, rawPaperId: unknown): Promise<{ removed: boolean }> {
  const paperId = parseInput(uuidSchema, rawPaperId);
  const rows = await run(db(), `DELETE FROM saved_papers WHERE user_id = $1 AND paper_id = $2 RETURNING paper_id`, [userId, paperId]);
  return { removed: rows.length > 0 };
}

export async function isPaperSaved(userId: string, paperId: string): Promise<boolean> {
  const rows = await run(db(), `SELECT 1 FROM saved_papers WHERE user_id = $1 AND paper_id = $2`, [userId, parseInput(uuidSchema, paperId)]);
  return rows.length > 0;
}

// ---------------- history by type (user-scoped) ----------------
export type HistoryKind = 'KEYWORD' | 'SEMANTIC' | 'QUESTION';
export interface HistoryEntry {
  id: string; text: string; createdAt: string; resultCount: number | null; filters: Record<string, unknown> | null;
  answerId: string | null; status: string | null;
}

export async function listHistoryByKind(userId: string, kind: HistoryKind, rawPaging: unknown): Promise<Page<HistoryEntry>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const offset = (page - 1) * pageSize;
  if (kind === 'QUESTION') {
    const rows = await run<{ id: string; question_text: string; created_at: Date; answer_id: string | null; status: string | null; n: string; total: string }>(
      db(),
      `SELECT q.id, q.question_text, q.created_at, a.id AS answer_id, a.status,
              (SELECT count(*) FROM answer_evidence ae WHERE ae.answer_id = a.id) AS n, count(*) OVER () AS total
       FROM questions q LEFT JOIN answers a ON a.question_id = q.id
       WHERE q.user_id = $1 ORDER BY q.created_at DESC, q.id LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    );
    return pageOf(
      rows.map((r) => ({ id: r.id, text: r.question_text, createdAt: r.created_at.toISOString(), resultCount: Number(r.n), filters: null, answerId: r.answer_id, status: r.status })),
      Number(rows[0]?.total ?? 0), page, pageSize,
    );
  }
  const rows = await run<{ id: string; query_text: string; created_at: Date; result_count: number; filters: Record<string, unknown>; total: string }>(
    db(),
    `SELECT id, query_text, created_at, result_count, filters, count(*) OVER () AS total
     FROM search_queries WHERE user_id = $1 AND search_type = $2 ORDER BY created_at DESC, id LIMIT $3 OFFSET $4`,
    [userId, kind, pageSize, offset],
  );
  return pageOf(
    rows.map((r) => ({ id: r.id, text: r.query_text, createdAt: r.created_at.toISOString(), resultCount: r.result_count, filters: r.filters, answerId: null, status: null })),
    Number(rows[0]?.total ?? 0), page, pageSize,
  );
}

// ---------------- question detail (owner or admin) ----------------
export interface QuestionDetail { questionId: string; question: string; createdAt: string; answerId: string | null; answer: string | null; status: string | null }

export async function getQuestion(questionId: unknown, userId: string, isAdmin: boolean): Promise<QuestionDetail> {
  const id = parseInput(uuidSchema, questionId);
  const [r] = await run<{ id: string; question_text: string; created_at: Date; user_id: string | null; answer_id: string | null; answer_text: string | null; status: string | null }>(
    db(),
    `SELECT q.id, q.question_text, q.created_at, q.user_id, a.id AS answer_id, a.answer_text, a.status
     FROM questions q LEFT JOIN answers a ON a.question_id = q.id WHERE q.id = $1`,
    [id],
  );
  if (!r) throw new AppError('NOT_FOUND', 'Question not found');
  if (r.user_id !== userId && !isAdmin) throw new AppError('FORBIDDEN', 'You cannot view this question');
  return { questionId: r.id, question: r.question_text, createdAt: r.created_at.toISOString(), answerId: r.answer_id, answer: r.answer_text, status: r.status };
}

// ---------------- dashboard ----------------
export interface DashboardData {
  totals: { papers: number; completedPapers: number };
  mine: { saved: number; keywordSearches: number; semanticSearches: number; questions: number };
  recentSearches: { id: string; text: string; type: string; createdAt: string }[];
  recentQuestions: { id: string; text: string; createdAt: string }[];
  system: null | { users: number; searches7d: number; questions7d: number; failedPapers: number };
}

export async function getDashboard(userId: string, isAdmin: boolean): Promise<DashboardData> {
  const [c] = await run<Record<string, string>>(
    db(),
    `SELECT (SELECT count(*) FROM papers) AS papers,
            (SELECT count(*) FROM papers WHERE processing_status = 'COMPLETED') AS completed,
            (SELECT count(*) FROM saved_papers WHERE user_id = $1) AS saved,
            (SELECT count(*) FROM search_queries WHERE user_id = $1 AND search_type = 'KEYWORD') AS kw,
            (SELECT count(*) FROM search_queries WHERE user_id = $1 AND search_type = 'SEMANTIC') AS sem,
            (SELECT count(*) FROM questions WHERE user_id = $1) AS qs`,
    [userId],
  );
  const recentSearches = await run<{ id: string; query_text: string; search_type: string; created_at: Date }>(
    db(), `SELECT id, query_text, search_type, created_at FROM search_queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [userId]);
  const recentQuestions = await run<{ id: string; question_text: string; created_at: Date }>(
    db(), `SELECT id, question_text, created_at FROM questions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [userId]);
  let system: DashboardData['system'] = null;
  if (isAdmin) {
    const [s] = await run<Record<string, string>>(
      db(),
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT count(*) FROM search_queries WHERE created_at > now() - interval '7 days') AS s7,
              (SELECT count(*) FROM questions WHERE created_at > now() - interval '7 days') AS q7,
              (SELECT count(*) FROM papers WHERE processing_status = 'FAILED') AS failed`,
    );
    system = { users: Number(s?.users), searches7d: Number(s?.s7), questions7d: Number(s?.q7), failedPapers: Number(s?.failed) };
  }
  return {
    totals: { papers: Number(c?.papers), completedPapers: Number(c?.completed) },
    mine: { saved: Number(c?.saved), keywordSearches: Number(c?.kw), semanticSearches: Number(c?.sem), questions: Number(c?.qs) },
    recentSearches: recentSearches.map((r) => ({ id: r.id, text: r.query_text, type: r.search_type, createdAt: r.created_at.toISOString() })),
    recentQuestions: recentQuestions.map((r) => ({ id: r.id, text: r.question_text, createdAt: r.created_at.toISOString() })),
    system,
  };
}

// ---------------- admin: processing / papers ----------------
export interface ProcessingItem { paperId: string; title: string; status: string; error: string | null; uploadedBy: string | null; updatedAt: string; chunkCount: number }

export async function listProcessing(rawQuery: unknown): Promise<{ counts: Record<string, number>; page: Page<ProcessingItem> }> {
  const { page, pageSize, status } = parseInput(processingQuerySchema, rawQuery ?? {});
  const countRows = await run<{ processing_status: string; n: string }>(db(), `SELECT processing_status, count(*) AS n FROM papers GROUP BY processing_status`);
  const counts: Record<string, number> = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0 };
  for (const r of countRows) counts[r.processing_status] = Number(r.n);
  const rows = await run<{ id: string; title: string; processing_status: string; processing_error: string | null; uploader: string | null; updated_at: Date; chunks: string; total: string }>(
    db(),
    `SELECT p.id, p.title, p.processing_status, left(p.processing_error, 300) AS processing_error, u.full_name AS uploader, p.updated_at,
            (SELECT count(*) FROM paper_chunks c WHERE c.paper_id = p.id) AS chunks, count(*) OVER () AS total
     FROM papers p LEFT JOIN users u ON u.id = p.uploaded_by
     WHERE ($1::text IS NULL OR p.processing_status = $1) ORDER BY p.updated_at DESC, p.id LIMIT $2 OFFSET $3`,
    [status ?? null, pageSize, (page - 1) * pageSize],
  );
  return {
    counts,
    page: pageOf(
      rows.map((r) => ({ paperId: r.id, title: r.title, status: r.processing_status, error: r.processing_error, uploadedBy: r.uploader, updatedAt: r.updated_at.toISOString(), chunkCount: Number(r.chunks) })),
      Number(rows[0]?.total ?? 0), page, pageSize,
    ),
  };
}

// ---------------- admin: categories (existing table) ----------------
export async function createCategory(raw: unknown): Promise<{ categoryId: number; name: string }> {
  const { name, description } = parseInput(categoryBodySchema, raw);
  const [r] = await run<{ id: number; name: string }>(db(), `INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id, name`, [name, description ?? null]);
  return { categoryId: (r as { id: number }).id, name: (r as { name: string }).name };
}

export async function updateCategory(rawId: unknown, raw: unknown): Promise<{ categoryId: number; name: string }> {
  const id = parseInput(uuidlessId, rawId);
  const { name, description } = parseInput(categoryBodySchema, raw);
  const [r] = await run<{ id: number; name: string }>(db(), `UPDATE categories SET name = $2, description = $3 WHERE id = $1 RETURNING id, name`, [id, name, description ?? null]);
  if (!r) throw new AppError('NOT_FOUND', 'Category not found');
  return { categoryId: r.id, name: r.name };
}

export async function deleteCategory(rawId: unknown): Promise<{ deleted: true }> {
  const id = parseInput(uuidlessId, rawId);
  const [used] = await run<{ n: string }>(db(), `SELECT count(*) AS n FROM paper_categories WHERE category_id = $1`, [id]);
  if (Number(used?.n) > 0) throw new AppError('DUPLICATE_RESOURCE', 'This category is assigned to papers and cannot be deleted');
  const rows = await run(db(), `DELETE FROM categories WHERE id = $1 RETURNING id`, [id]);
  if (rows.length === 0) throw new AppError('NOT_FOUND', 'Category not found');
  return { deleted: true };
}

// ---------------- admin: analytics ----------------
export interface Analytics {
  papersByStatus: Record<string, number>;
  usersByRole: Record<string, number>;
  activityByDay: { day: string; keyword: number; semantic: number; questions: number }[];
  answersByStatus: Record<string, number>;
  topCategories: { name: string; papers: number }[];
  mostRetrievedPapers: { paperId: string; title: string; retrievals: number }[];
  mostCitedPapers: { paperId: string; title: string; citations: number }[];
}

export async function getAnalytics(): Promise<Analytics> {
  const kv = async (sql: string) => Object.fromEntries((await run<{ k: string; n: string }>(db(), sql)).map((r) => [r.k, Number(r.n)]));
  const [papersByStatus, usersByRole, answersByStatus] = await Promise.all([
    kv(`SELECT processing_status AS k, count(*) AS n FROM papers GROUP BY 1`),
    kv(`SELECT r.name AS k, count(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id GROUP BY 1`),
    kv(`SELECT status AS k, count(*) AS n FROM answers GROUP BY 1`),
  ]);
  const days = await run<{ day: Date; kw: string; sem: string; q: string }>(
    db(),
    `SELECT d.day::date AS day,
            (SELECT count(*) FROM search_queries s WHERE s.created_at::date = d.day::date AND s.search_type = 'KEYWORD') AS kw,
            (SELECT count(*) FROM search_queries s WHERE s.created_at::date = d.day::date AND s.search_type = 'SEMANTIC') AS sem,
            (SELECT count(*) FROM questions q WHERE q.created_at::date = d.day::date) AS q
     FROM generate_series(current_date - 13, current_date, interval '1 day') AS d(day) ORDER BY d.day`,
  );
  const cats = await run<{ name: string; n: string }>(db(),
    `SELECT c.name, count(pc.paper_id) AS n FROM categories c LEFT JOIN paper_categories pc ON pc.category_id = c.id GROUP BY c.id ORDER BY n DESC, c.name LIMIT 8`);
  const retrieved = await run<{ id: string; title: string; n: string }>(db(),
    `SELECT p.id, p.title, count(*) AS n FROM search_results sr JOIN papers p ON p.id = sr.paper_id GROUP BY p.id ORDER BY n DESC, p.title LIMIT 5`);
  const cited = await run<{ id: string; title: string; n: string }>(db(),
    `SELECT p.id, p.title, count(*) AS n FROM answer_evidence ae JOIN paper_chunks c ON c.id = ae.chunk_id JOIN papers p ON p.id = c.paper_id
     GROUP BY p.id ORDER BY n DESC, p.title LIMIT 5`);
  return {
    papersByStatus, usersByRole, answersByStatus,
    activityByDay: days.map((d) => ({ day: d.day.toISOString().slice(0, 10), keyword: Number(d.kw), semantic: Number(d.sem), questions: Number(d.q) })),
    topCategories: cats.map((c) => ({ name: c.name, papers: Number(c.n) })),
    mostRetrievedPapers: retrieved.map((r) => ({ paperId: r.id, title: r.title, retrievals: Number(r.n) })),
    mostCitedPapers: cited.map((r) => ({ paperId: r.id, title: r.title, citations: Number(r.n) })),
  };
}
