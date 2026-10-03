/**
 * Member 2 integration contract. Import `researchService()` from API routes / server actions.
 * Every method validates its input, returns DTOs from lib/types.ts, and throws AppError
 * (convert with toErrorResponse from lib/errors).
 */
import type { Pool as PgPool } from 'pg';
import { createAnswerGenerator, type AnswerGenerator } from '../ai/answerGenerator';
import { getPool } from '../db/client';
import { getPaperById, listAuthors, listCategories, listPapers, savePaperForUser } from '../db/queries/catalog';
import { EvidenceService } from '../evidence/retrieval';
import { IngestionPipeline, type IngestInput } from '../research/ingest';
import { listHistory, recordSearch } from '../search/history';
import { searchPapersKeyword } from '../search/keyword';
import { SemanticSearchService } from '../search/semantic';
import { FixedWindowRateLimiter } from '../security/rateLimit';
import { requireRole, requireUser } from '../security/authz';
import type {
  AskResponse, AuthContext, AuthorItem, CategoryItem, EvidenceItem, HistoryItem, IngestResult, Page,
  PaperDetail, PaperListItem, PaperSearchHit, SemanticSearchResponse,
} from '../types';
import { createEmbeddingService, type EmbeddingService } from '../vector/embeddings';
import { parseInput, uuidSchema, type Filters } from '../validation/schemas';

export interface ResearchServiceDeps {
  db?: PgPool;
  embeddings?: EmbeddingService;
  generator?: () => AnswerGenerator;
  limiter?: FixedWindowRateLimiter;
}

export interface ResearchService {
  searchPapers(input: { query: string; filters?: Filters; page?: number; pageSize?: number }, ctx?: AuthContext): Promise<Page<PaperSearchHit>>;
  semanticSearch(input: { query: string; topK?: number; filters?: Filters; minSimilarity?: number }, ctx?: AuthContext): Promise<SemanticSearchResponse>;
  getPaper(paperId: string): Promise<PaperDetail>;
  getPaperEvidence(paperId: string, query: string, topK?: number): Promise<SemanticSearchResponse>;
  askWithEvidence(input: { question: string; topK?: number; filters?: Filters }, ctx: AuthContext): Promise<AskResponse>;
  getAnswerEvidence(answerId: string, ctx: AuthContext): Promise<EvidenceItem[]>;
  savePaper(paperId: string, ctx: AuthContext): Promise<{ saved: true; alreadySaved: boolean }>;
  getResearchHistory(ctx: AuthContext, paging?: { page?: number; pageSize?: number }): Promise<Page<HistoryItem>>;
  listPapers(paging?: { page?: number; pageSize?: number }, filters?: Filters): Promise<Page<PaperListItem>>;
  listCategories(paging?: { page?: number; pageSize?: number }): Promise<Page<CategoryItem>>;
  listAuthors(paging?: { page?: number; pageSize?: number }): Promise<Page<AuthorItem>>;
  /** ADMIN only. */
  ingestPaper(input: IngestInput, ctx: AuthContext): Promise<IngestResult>;
}

export function createResearchService(deps: ResearchServiceDeps = {}): ResearchService {
  const db = deps.db ?? getPool();
  let embeddings = deps.embeddings;
  const getEmbeddings = (): EmbeddingService => (embeddings ??= createEmbeddingService());
  const limiter = deps.limiter ?? new FixedWindowRateLimiter(30, 60_000);

  const semantic = (): SemanticSearchService => new SemanticSearchService({ db, embeddings: getEmbeddings() });
  const evidence = (): EvidenceService =>
    new EvidenceService({ db, search: semantic(), generator: deps.generator ?? createAnswerGenerator });

  return {
    async searchPapers(input, ctx) {
      if (ctx) limiter.check(ctx.userId);
      const page = await searchPapersKeyword(db, input);
      if (ctx) {
        await recordSearch({
          userId: ctx.userId, query: input.query, type: 'KEYWORD', filters: input.filters ?? {},
          results: page.items.map((i) => ({ paperId: i.paperId, chunkId: null, score: i.rank })),
        });
      }
      return page;
    },

    async semanticSearch(input, ctx) {
      if (ctx) limiter.check(ctx.userId);
      const response = await semantic().search(input);
      if (ctx) {
        await recordSearch({
          userId: ctx.userId, query: response.query, type: 'SEMANTIC', filters: input.filters ?? {},
          results: response.results.map((r) => ({ paperId: r.paperId, chunkId: r.chunkId, score: r.similarity })),
        });
      }
      return response;
    },

    getPaper: (paperId) => getPaperById(db, paperId),

    getPaperEvidence(paperId, query, topK) {
      const id = parseInput(uuidSchema, paperId);
      return semantic().search({ query, topK, filters: { paperIds: [id] } });
    },

    askWithEvidence(input, ctx) {
      requireUser(ctx);
      limiter.check(ctx.userId);
      return evidence().askWithEvidence(input, ctx);
    },

    getAnswerEvidence: (answerId, ctx) => evidence().getAnswerEvidence(parseInput(uuidSchema, answerId), ctx),

    savePaper(paperId, ctx) {
      requireUser(ctx);
      return savePaperForUser(db, ctx.userId, paperId);
    },

    getResearchHistory(ctx, paging) {
      requireUser(ctx);
      return listHistory(db, ctx.userId, paging);
    },

    listPapers: (paging, filters) => listPapers(db, paging, filters),
    listCategories: (paging) => listCategories(db, paging),
    listAuthors: (paging) => listAuthors(db, paging),

    ingestPaper(input, ctx) {
      requireRole(ctx, 'ADMIN');
      return new IngestionPipeline({ db, embeddings: getEmbeddings() }).ingest({ ...input, uploadedBy: ctx.userId });
    },
  };
}

let defaultService: ResearchService | undefined;

/** Lazily-created singleton wired to the real database and configured providers. */
export function researchService(): ResearchService {
  return (defaultService ??= createResearchService());
}
