# ResearchIQ

AI-powered research paper intelligence: keyword search, semantic (pgvector) search and evidence-grounded question answering.

- **Member 1** - PostgreSQL schema, pgvector, ingestion, embeddings, search and evidence services (`lib/`, `database/`, `scripts/`).
- **Member 2** - Next.js application, authentication, RBAC, API, UI, admin, security and tests (`app/`, `components/`, `lib/auth`, `lib/api`, `lib/services/{researchiq,library,users}.ts`).

## Prerequisites
Node.js >= 20, PostgreSQL 16 with pgvector (`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 pgvector/pgvector:pg16`), an OpenAI-compatible embeddings API key (and chat key for Q&A).

## Setup
```bash
npm install
cp .env.example .env.local          # fill in DATABASE_URL, SESSION_SECRET, EMBEDDING_API_KEY, AI_API_KEY
openssl rand -base64 48             # use the output as SESSION_SECRET (min 32 chars)
npm run migrate                     # schema, indexes, triggers, views
npm run seed                        # sample papers (embeds them, needs EMBEDDING_API_KEY)
```
Scripts read `process.env`; export the variables or run with `node --env-file=.env.local` (e.g. `node --env-file=.env.local --import tsx scripts/migrate.ts`) if your shell does not load `.env.local`.
Next.js loads `.env.local` automatically for `dev`/`build`/`start`.

## Accounts
- **Researcher:** open `/register`. New accounts are always `RESEARCHER`.
- **Admin:** `ADMIN_EMAIL=you@x.org ADMIN_NAME="Your Name" ADMIN_PASSWORD='Str0ng-Password' npm run create-admin`

## Run
```bash
npm run dev                          # http://localhost:3000
npm run build && npm run start       # production
npm run typecheck && npm run lint
npm test                             # unit tests; DB tests need TEST_DATABASE_URL
TEST_DATABASE_URL=postgres://... npm test
E2E_BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test   # API journey against a running app
```
Use a **disposable** database for `TEST_DATABASE_URL`.

## Troubleshooting
- `SESSION_SECRET must be set` - add a 32+ character secret to `.env.local`.
- `Invalid server configuration: DATABASE_URL` - set it; run `npm run migrate` first.
- Semantic search/Q&A errors (502) - check `EMBEDDING_API_KEY` / `AI_API_KEY`; keyword search works without them.
- 429 responses - rate limiting; wait for the window to expire.

## Docs
`docs/application-architecture.md`, `docs/api.md`, `docs/authentication.md`, `docs/security.md`, `docs/testing.md`, `docs/member2-contribution.md`, `docs/member2-gap-analysis.md`; Member 1: `docs/member1-contribution.md`, `docs/integration-contract.md`, `docs/database-design.md`.
