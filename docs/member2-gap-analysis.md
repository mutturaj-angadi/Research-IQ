# Member 2 gap analysis (Phase 1 audit)

## What Member 1 already provides (reused, not rebuilt)
- PostgreSQL schema (migrations 001-004), pgvector `vector(768)`, FTS `tsvector` columns, indexes, triggers
  (`set_updated_at`, `normalize_author_name`, `enforce_completed_requires_embeddings`), `paper_summary_view`,
  `get_paper_statistics()`, least-privilege role `researchiq_app`.
- Tables `users`, `roles`, `user_roles` already exist: **`password_hash` (>=20 chars), `is_active`, `full_name`, lowercase unique email**.
  Member 1 explicitly leaves password hashing to Member 2. There is **no sessions table** (see risks).
- `lib/services/index.ts` -> `researchService()`: searchPapers, semanticSearch, getPaper, getPaperEvidence,
  askWithEvidence, getAnswerEvidence, savePaper, getResearchHistory, listPapers, listCategories, listAuthors, ingestPaper.
- DTOs (`lib/types.ts`), Zod schemas (`lib/validation/schemas.ts`), `AppError` + `toErrorResponse` (`lib/errors`),
  `FixedWindowRateLimiter`, `requireUser` / `requireRole`, `getPool`/`run`/`withTransaction`, ingestion, embeddings, answer generation.

## What Member 2 must build
Next.js App Router app, auth (register/login/logout/me), signed-cookie sessions, RBAC, API route handlers with a uniform
`{success,data|error}` envelope, application service layer (users, saved list, dashboard, admin), all UI pages and
components, upload endpoint, security headers, tests, docs.

## Integration points / gaps found in the contract
| Need | Member 1 status | Member 2 action |
|---|---|---|
| Unsave a paper | **Missing** (only `savePaper`) | App query `DELETE FROM saved_papers WHERE user_id=$1 AND paper_id=$2` |
| List saved papers | **Missing** | App query joining `saved_papers`/`paper_summary_view` (user-scoped) |
| Past question + answer view | Only `getAnswerEvidence(answerId)` | App query for question/answer text (owner or admin) |
| Dashboard / admin analytics | **Missing** | Aggregate queries (COUNT/GROUP BY) in `lib/services/` |
| Admin user list, category CRUD | **Missing** | App queries; categories use existing table |
| Processing status list | Column exists | App query on `papers.processing_status` |
| History split keyword/semantic/questions | `HistoryItem` has kind SEARCH/QUESTION only | App query adds `search_type` |
| Paper `storage_path` | Column exists | Never exposed in DTOs |

## Risks / conflicts
1. **No sessions table and "do not change schema unless necessary".** Decision: stateless HMAC-signed cookie
   (`SESSION_SECRET`), user re-loaded from DB on every request so deactivation and role changes apply immediately. No migration.
2. **Error code mismatch.** Member 1 uses `DUPLICATE_RESOURCE`; the Member 2 spec lists `CONFLICT`. Envelope maps it to `CONFLICT`
   in the public response.
3. **Member 1 limiter is in-memory per process** and keyed by user; auth endpoints need an IP-keyed limiter (same class reused).
4. **`recordSearch` uses the default pool**, so tests that inject a pool must use `DATABASE_URL`.
5. **Module format:** package is `"type":"module"` with extensionless imports; Next bundler handles this, `tsx` for scripts/tests.
6. **Sandbox cannot install npm packages**, so build/lint/typecheck of the Next layer must be run locally.
7. Seed data has no users; admin must be bootstrapped by a script (`npm run create-admin`).
