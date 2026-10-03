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
