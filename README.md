# ResearchIQ - Member 1 (database + semantic search)

## Setup
1. PostgreSQL 16 with pgvector (e.g. `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 pgvector/pgvector:pg16`).
2. `npm install`, copy `.env.example` to `.env`, set `DATABASE_URL`, `EMBEDDING_API_KEY` (and `AI_API_KEY` for Q&A).
3. `npm run migrate` -> `npm run seed` (loads data and embeds it) -> `npm run typecheck` -> `npm test`.
4. Optional: `npm run ingest -- ./pdfs`, `npm run embed`, `npm run reindex`, `npm run migrate:down`.

Docs: see `docs/`. Member 1 contribution summary: `docs/member1-contribution.md`.
