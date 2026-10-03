# Testing
Run: `npm test` (node:test via tsx). Tests that need PostgreSQL run only when `TEST_DATABASE_URL` points at a **disposable**, migrated database (`DATABASE_URL=$TEST_DATABASE_URL npm run migrate`). Without it they are skipped.

| Area | Files | Needs DB |
|---|---|---|
| Chunking, cleaning, metadata, upload validation | tests/ingestion/*.test.ts | no |
| Embedding client (batching, retry, dimension, key leakage), filters | tests/vector | no |
| Input validation (topK, filters, pagination) | tests/search/validation.test.ts | no |
| Security: injection payloads, safe errors, authz, rate limit, log redaction | tests/security/security.test.ts | no |
| Constraints, FKs, uniqueness, triggers, view, function, cascade, FTS | tests/database/schema.test.ts | yes |
| Ingestion pipeline: valid, duplicate, embedding failure + retry, extraction failure, rollback | tests/ingestion/pipeline.db.test.ts | yes |
| Semantic search, filters, no-results, real-chunk evidence, grounded answers | tests/search/semantic.db.test.ts | yes |
| SQL injection against the live DB | tests/security/sql-injection.db.test.ts | yes |

Test doubles (fake embeddings with orthogonal basis vectors, stub answer generator) exist only in `tests/helpers` and are never imported by production code.

---
# Member 2 tests
| File | Needs | Covers |
|---|---|---|
| tests/auth/password.test.ts, token.test.ts, policy.test.ts | nothing | hashing, session tokens (tamper/expiry), authorization matrix |
| tests/api/response.test.ts | nothing | envelope, error mapping, no leakage, CSRF origin check, malformed/oversized JSON |
| tests/auth/validation.test.ts | npm install | registration/login/pagination/injection validation |
| tests/integration/app.db.test.ts | `TEST_DATABASE_URL` | register/login/duplicate/disabled, hash storage, saved-paper isolation, history scoping, question IDOR, dashboard, category guard, analytics |
| tests/integration/e2e.api.test.ts | running app, `E2E_BASE_URL` (+ `ADMIN_EMAIL/PASSWORD`) | full researcher and admin API journey, 401/403/400 cases, privilege escalation, upload rejection |

UI flows are covered through the API journey; no browser test runner is configured. Keyword/semantic/Ask happy paths need seeded, embedded data and provider keys.
