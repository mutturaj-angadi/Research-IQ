# Speaker Notes

## Slide 1 — Title
Introduce ResearchIQ as a research paper intelligence system with a database-first design. Add personal and course details before presenting; they were not available in the repository.

## Slide 2 — Problem Statement
Explain that meaning is not always captured by exact word matching. A user may ask about feasible links while a paper describes distance and line-of-sight. Keyword search can miss different phrasing. AI also needs traceability so a reader can inspect the passage behind a claim.

## Slide 3 — Proposed Solution
Walk through PDF → extracted text → chunks → vectors → search → answer. Metadata stays relational. Semantic search embeds the question, compares it with stored chunk vectors, and retrieves real passages. Gemini generates after retrieval; it does not query PostgreSQL directly. The verified corpus contains one paper, so discuss capabilities rather than scale.

## Slide 4 — System Architecture
The browser calls Next.js route handlers. Handlers validate input, authenticate the caller, enforce permissions, and call services. Services use parameterized SQL through pg. Embedding generation and answer generation are separate provider operations. The GitHub import path processes PDF bytes in memory and stores release metadata and the linked paper, not PDF bytes.

## Slide 5 — Database Design
Start with papers → paper_chunks → chunk_embeddings. Explain bridge tables for authors/categories and users/roles/saved papers. For RAG, trace questions → answers → answer_evidence → chunks. The answer-evidence row references a concrete source chunk.

## Slide 6 — Database Implementation
Constraints protect data even if a write does not come through the web API. Examples: unique file hash, allowed statuses, answer text required for ANSWERED, and trigger guard before paper completion. Migrations are ordered and recorded in schema_migrations. The application role cannot read that ledger; local administrative access verified migrations 001–005.

Normalization is visible in separate authors/categories and junction tables. Vectors and generated full-text vectors are deliberate derived search data. The summary view computes counts instead of storing redundant totals in papers.

## Slide 7 — SQL and pgvector
Use COUNT(DISTINCT) when joining paper_chunks and chunk_embeddings so counts are not multiplied. pgvector operator <=> returns cosine distance; lower distance means closer. Similarity is 1 − distance. HNSW is approximate and the query planner can choose another plan based on filters and statistics.

## Slide 8 — Working Demonstration
Open http://127.0.0.1:3000. Sign in with the existing admin without showing password or cookie. Show /admin, /papers, search, semantic-search, ask, and history. Authenticated API checks passed for dashboard, paper list/detail, keyword search, semantic search, evidence, and history. The existing matching answer is persisted; re-asking creates a new question and answer row. The GitHub admin page rendered, but the asset-list endpoint returned 429 from the configured rate limiter; do not claim sync worked in this check or retry in the same cooldown.

## Slide 9 — Results and Testing
The database has one completed paper, 42 chunks, and 42 768-dimensional vectors. One answer is ANSWERED with two evidence rows; two earlier attempts remain FAILED. The test command passed 100 tests, but database-dependent suites were skipped because TEST_DATABASE_URL was absent. Live DB and application checks were separately performed.

## Slide 10 — Conclusion and Future Scope
Close with the DBMS concepts behind the AI: reliable relations, foreign keys, constraints, transactions, and indexes. Future work includes a disposable test database, a larger corpus, retrieval-quality evaluation, realistic latency testing, and better GitHub rate-limit handling. One paper is not evidence of production scale.

