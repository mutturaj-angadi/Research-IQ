# Member 2 integration contract
```ts
import { researchService } from '@/lib/services';
import { toErrorResponse } from '@/lib/errors';
const svc = researchService();            // lazily wired to DATABASE_URL and provider env vars
```
`ctx` is `{ userId: string; roles: ('ADMIN'|'RESEARCHER')[] }`, built by your auth layer.

| Method | Input | Output |
|---|---|---|
| searchPapers(input, ctx?) | `{ query, filters?, page?, pageSize? }` | `Page<PaperSearchHit>` |
| semanticSearch(input, ctx?) | `{ query, topK?, filters?, minSimilarity? }` | `SemanticSearchResponse` (`results[]`, `noEvidence`) |
| getPaper(paperId) | uuid | `PaperDetail` |
| getPaperEvidence(paperId, query, topK?) | uuid, text | `SemanticSearchResponse` limited to that paper |
| askWithEvidence(input, ctx) | `{ question, topK?, filters? }` | `AskResponse` (`status`, `answer`, `evidence[]`) |
| getAnswerEvidence(answerId, ctx) | uuid | `EvidenceItem[]` (owner or admin) |
| savePaper(paperId, ctx) | uuid | `{ saved, alreadySaved }` |
| getResearchHistory(ctx, paging?) | page, pageSize | `Page<HistoryItem>` |
| listPapers / listCategories / listAuthors(paging?) | | `Page<...>` |
| ingestPaper({ buffer, fileName, mimeType, metadata? }, ctx) | ADMIN only | `IngestResult` (`INGESTED`/`REPROCESSED`/`DUPLICATE`) |

DTOs: `lib/types.ts`. Filters: `{ yearFrom, yearTo, categoryIds[], authorId, venue, paperIds[] }` (strict; unknown keys are rejected).
Errors: every method throws `AppError`; in an API route `const { status, body } = toErrorResponse(err)`. Codes: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, DUPLICATE_RESOURCE 409, PDF_PROCESSING_ERROR 422, RATE_LIMITED 429, EMBEDDING_ERROR 502, DATABASE_ERROR / VECTOR_SEARCH_ERROR / INTERNAL_ERROR 500.
UI rules: render `answer` and `evidence` separately; if `status !== 'ANSWERED'` show the message and no sources; never display page numbers or titles that did not come from `evidence`.
