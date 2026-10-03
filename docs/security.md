# Security

| Control | Where |
|---|---|
| No secrets in code; `.env.example` has names only | `lib/config.ts` (zod-validated env; errors name variables, never values) |
| Parameterised SQL only; filters are bound parameters | `lib/vector/filters.ts`, all queries use `$n` |
| Input validation (IDs, years, topK, page size, lengths, strict filter objects) | `lib/validation/schemas.ts`; DB CHECK/UNIQUE/FK still enforce integrity |
| Upload validation and size limit | `lib/research/upload.ts` |
| Authorization: ingestion ADMIN-only; saving/history/ask need a user; answer evidence owner-or-admin | `lib/security/authz.ts`, services |
| Rate limiting (30 req/min per user, in-memory) | `lib/security/rateLimit.ts` (use a shared store if scaled out) |
| Safe errors: stable codes, no SQL, stack, paths or credentials | `lib/errors` |
| Safe logging: scalar fields only, secret-looking keys dropped, error codes not messages | `lib/logger.ts` |
| Least privilege: app role `researchiq_app` has DML only | migration 004 |
| Full-text queries use `websearch_to_tsquery` (no tsquery syntax injection) | `lib/search/keyword.ts` |
| Prompt-injection hardening: sources are delimited data; citations not matching retrieved chunks are discarded; an answer with no valid citation is never shown | `lib/ai`, `lib/evidence` |

Operational notes: run the app as `researchiq_app`, migrations as the owner; store the password hashing (bcrypt/argon2) in Member 2's auth layer; `users.password_hash` should never be selected into DTOs.

---
# Member 2 application security
- Authentication/session design: `docs/authentication.md` (scrypt, signed HttpOnly SameSite cookie, per-request user reload).
- Authorization: server-side permission matrix on every API route and admin page guard; resource ownership in SQL (`WHERE user_id = $1`) and `getQuestion`/Member 1 `getAnswerEvidence`.
- Input: Zod on every body/query/param; pagination capped at 50; queries <= 500 chars, questions <= 2000; JSON body <= 64 KB; unknown filter keys rejected.
- Database: only parameterised queries; no SQL in components/routes.
- CSRF: SameSite=Lax + Origin/Host check on non-GET requests. XSS: React escaping, no `dangerouslySetInnerHTML`, CSP header.
- Headers (`next.config.mjs`): CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- Rate limits: login/register 10 per 15 min per IP; semantic 20/min, Ask 10/min, evidence 20/min, upload 10/h per user; Member 1's per-user limiter also applies inside `researchService`. In-memory (single instance) - use a shared store when scaled out.
- Uploads: admin only; `multipart` type check, `application/pdf`, <= 20 MB, filename regex, `%PDF-` magic bytes, SHA-256 duplicate detection (Member 1). Files are not written to disk.
- Errors: uniform envelope; no stack, SQL or paths; 5xx details only in server logs.
- Secrets: only in environment; `.env*` ignored by Git; never imported by client components.
