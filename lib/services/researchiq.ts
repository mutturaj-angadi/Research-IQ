/**
 * Application adapter over Member 1's researchService(). UI and routes depend on this module only,
 * never on Member 1 internals. It builds the AuthContext from the authenticated user.
 */
import { researchService } from './index';
import type { CurrentUser } from '../auth/session';
import type { AuthContext } from '../types';
import type { Filters } from '../validation/schemas';

const ctx = (u: CurrentUser): AuthContext => ({ userId: u.id, roles: u.roles });

export const researchiq = {
  searchPapers: (u: CurrentUser, input: { query: string; filters?: Filters; page?: number; pageSize?: number }) =>
    researchService().searchPapers(input, ctx(u)),
  semanticSearch: (u: CurrentUser, input: { query: string; topK?: number; filters?: Filters }) =>
    researchService().semanticSearch(input, ctx(u)),
  getPaper: (id: string) => researchService().getPaper(id),
  getPaperEvidence: (id: string, query: string, topK?: number) => researchService().getPaperEvidence(id, query, topK),
  ask: (u: CurrentUser, input: { question: string; topK?: number; filters?: Filters }) =>
    researchService().askWithEvidence(input, ctx(u)),
  getAnswerEvidence: (u: CurrentUser, answerId: string) => researchService().getAnswerEvidence(answerId, ctx(u)),
  savePaper: (u: CurrentUser, paperId: string) => researchService().savePaper(paperId, ctx(u)),
  history: (u: CurrentUser, paging?: { page?: number; pageSize?: number }) => researchService().getResearchHistory(ctx(u), paging),
  listPapers: (paging?: { page?: number; pageSize?: number }, filters?: Filters) => researchService().listPapers(paging, filters),
  listCategories: (paging?: { page?: number; pageSize?: number }) => researchService().listCategories(paging),
  listAuthors: (paging?: { page?: number; pageSize?: number }) => researchService().listAuthors(paging),
  ingestPaper: (u: CurrentUser, input: Parameters<ReturnType<typeof researchService>['ingestPaper']>[0]) =>
    researchService().ingestPaper(input, ctx(u)),
};
