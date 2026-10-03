# Member 2 database/application integration contribution

Member 1 owns the schema, vector search, ingestion and `researchService()`. Member 2 consumes them and adds:

- Next.js App Router application (landing, auth, dashboard, library, paper detail, keyword/semantic search, Ask, saved, history, admin x5).
- Auth (scrypt, signed cookies), RBAC matrix, uniform API envelope, rate limiting, CSRF/headers, upload endpoint.
- **Application SQL** (`lib/services/library.ts`, `users.ts`): user-scoped saved list/unsave, history by search type, question ownership, dashboard and admin analytics (COUNT/GROUP BY, subqueries, `generate_series`, window `count(*) OVER()`), admin processing view, category CRUD with FK-aware guard, user registration in a transaction (`users` + `user_roles`).
- Uses Member 1 features: `paper_summary_view`, `get_paper_statistics()`, FTS ranking, pgvector similarity, `recordSearch` transactions.
- Tests: auth, policy, API envelope, validation, DB integration, e2e API.
Member 1's schema and vector code were not modified.
