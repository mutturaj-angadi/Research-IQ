import type { Pool as PgPool } from 'pg';
import { INSUFFICIENT_EVIDENCE, type AnswerGenerator, type AnswerSource } from '../ai/answerGenerator';
import { run } from '../db/client';
import { withTransaction } from '../db/transactions/withTransaction';
import { AppError } from '../errors';
import { errorFields, logger } from '../logger';
import { requireUser } from '../security/authz';
import type { SemanticSearchService } from '../search/semantic';
import type { AskResponse, AuthContext, EvidenceItem, SemanticSearchResult } from '../types';
import { askSchema, parseInput } from '../validation/schemas';

export const NO_EVIDENCE_ANSWER = 'No supporting evidence was found in the indexed papers.';
const FAILED_ANSWER = 'The answer could not be generated.';

/** Citation numbers the model wrote, restricted to numbers that were actually provided as sources. */
export function extractCitedNumbers(answer: string, sourceCount: number): number[] {
  const cited: number[] = [];
  for (const match of answer.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= sourceCount && !cited.includes(n)) cited.push(n);
  }
  return cited;
}

function toEvidenceItem(r: SemanticSearchResult, rank: number): EvidenceItem {
  return {
    rank,
    relevanceScore: r.similarity,
    paperId: r.paperId,
    paperTitle: r.paperTitle,
    chunkId: r.chunkId,
    pageNumber: r.pageNumber,
    section: r.section,
    snippet: r.snippet,
    authors: r.authors,
  };
}

export class EvidenceService {
  constructor(private readonly deps: { db: PgPool; search: SemanticSearchService; generator: () => AnswerGenerator }) {}

  /**
   * retrieve -> (no evidence? stop, no model call) -> generate -> keep only citations that map to
   * retrieved chunks -> persist question, answer and evidence atomically.
   */
  async askWithEvidence(raw: unknown, ctx: AuthContext): Promise<AskResponse> {
    requireUser(ctx);
    const input = parseInput(askSchema, raw);
    const retrieval = await this.deps.search.search({ query: input.question, topK: input.topK, filters: input.filters });

    if (retrieval.noEvidence) return this.persist(ctx, input.question, 'NO_EVIDENCE', NO_EVIDENCE_ANSWER, null, []);

    const sources: AnswerSource[] = retrieval.results.map((r, i) => ({
      number: i + 1,
      title: r.paperTitle,
      section: r.section,
      pageNumber: r.pageNumber,
      content: r.content,
    }));

    const generator = this.deps.generator();
    let text: string;
    try {
      text = await generator.generate(input.question, sources);
    } catch (err) {
      logger.error('qa.generation_failed', errorFields(err));
      return this.persist(ctx, input.question, 'FAILED', FAILED_ANSWER, generator.model, []);
    }

    const cited = extractCitedNumbers(text, sources.length);
    if (text.trim() === INSUFFICIENT_EVIDENCE || cited.length === 0) {
      return this.persist(ctx, input.question, 'NO_EVIDENCE', NO_EVIDENCE_ANSWER, generator.model, []);
    }
    const evidence = cited.map((n, i) => toEvidenceItem(retrieval.results[n - 1] as SemanticSearchResult, i + 1));
    return this.persist(ctx, input.question, 'ANSWERED', text, generator.model, evidence);
  }

  private async persist(
    ctx: AuthContext,
    question: string,
    status: AskResponse['status'],
    answer: string,
    model: string | null,
    evidence: EvidenceItem[],
  ): Promise<AskResponse> {
    return withTransaction(async (tx) => {
      const [q] = await run<{ id: string }>(tx, `INSERT INTO questions (user_id, question_text) VALUES ($1, $2) RETURNING id`, [ctx.userId, question]);
      const questionId = (q as { id: string }).id;
      const [a] = await run<{ id: string }>(
        tx,
        `INSERT INTO answers (question_id, answer_text, status, model) VALUES ($1, $2, $3, $4) RETURNING id`,
        [questionId, answer, status, model],
      );
      const answerId = (a as { id: string }).id;
      if (evidence.length > 0) {
        await run(
          tx,
          `INSERT INTO answer_evidence (answer_id, chunk_id, rank, relevance_score)
           SELECT $1::uuid, u.chunk_id, u.rank, u.score FROM unnest($2::uuid[], $3::int[], $4::float8[]) AS u(chunk_id, rank, score)`,
          [answerId, evidence.map((e) => e.chunkId), evidence.map((e) => e.rank), evidence.map((e) => e.relevanceScore)],
        );
      }
      return { questionId, answerId, status, answer, evidence };
    }, this.deps.db);
  }

  /** Evidence stored for an answer, joined back to the real chunk and paper. Owner or admin only. */
  async getAnswerEvidence(answerId: string, ctx: AuthContext): Promise<EvidenceItem[]> {
    requireUser(ctx);
    const owner = await run<{ user_id: string | null }>(
      this.deps.db,
      `SELECT q.user_id FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.id = $1`,
      [answerId],
    );
    if (owner.length === 0) throw new AppError('NOT_FOUND', 'Answer not found');
    if (owner[0]?.user_id !== ctx.userId && !ctx.roles.includes('ADMIN')) throw new AppError('FORBIDDEN', 'You cannot view this answer');
    const rows = await run<{
      rank: number; relevance_score: number; paper_id: string; title: string; chunk_id: string;
      page_number: number | null; section: string | null; snippet: string; authors: string[];
    }>(
      this.deps.db,
      `SELECT ae.rank, ae.relevance_score, p.id AS paper_id, p.title, c.id AS chunk_id, c.page_number, c.section,
              left(c.content, 500) AS snippet,
              COALESCE((SELECT array_agg(au.full_name ORDER BY pa.author_order)
                        FROM paper_authors pa JOIN authors au ON au.id = pa.author_id WHERE pa.paper_id = p.id), '{}') AS authors
       FROM answer_evidence ae
       JOIN paper_chunks c ON c.id = ae.chunk_id
       JOIN papers p ON p.id = c.paper_id
       WHERE ae.answer_id = $1 ORDER BY ae.rank`,
      [answerId],
    );
    return rows.map((r) => ({
      rank: r.rank, relevanceScore: Number(r.relevance_score), paperId: r.paper_id, paperTitle: r.title, chunkId: r.chunk_id,
      pageNumber: r.page_number, section: r.section, snippet: r.snippet, authors: r.authors,
    }));
  }
}
