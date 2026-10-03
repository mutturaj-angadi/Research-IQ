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
