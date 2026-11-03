# ResearchIQ — DBMS Project Presentation

**PES University · DBMS project presentation**

No student/course details were supplied or found in the repository; add them on the title slide if needed.

## Slide 1 — Title
- ResearchIQ: AI-Powered Research Paper Intelligence System
- DBMS Project Presentation · PES University
- Student/course details: add locally
- Visual: [Live landing page screenshot](screenshots/researchiq-home.png)

## Slide 2 — Problem Statement
- Long papers use different terms for similar ideas.
- Exact keyword matching can miss passages using different wording.
- Manually reading whole papers to locate evidence takes time.
- Generic AI answers are difficult to audit without source passages.
- Need structured storage, semantic retrieval, and traceable answers.

## Slide 3 — Proposed Solution
- Store paper metadata and extracted passages in PostgreSQL.
- Split PDFs into chunks and create 768-dimensional embeddings.
- Use PostgreSQL full-text search and pgvector cosine retrieval.
- Ask Gemini to answer only from retrieved chunks.
- Persist questions, answer status, and evidence links.
- Intended benefit: less manual searching with citations readers can inspect; no time-saving study was measured.
- Verified corpus: 1 paper, 42 chunks, 42 embeddings.

## Slide 4 — System Architecture
- Frontend: Next.js 15 App Router and React 19.
- Server: Next.js route handlers, TypeScript services, Zod validation, pg pool.
- Database: PostgreSQL 16.15 and pgvector 0.6.0.
- Embeddings: Gemini-compatible endpoint; stored model gemini-embedding-001.
- Answer generation: native Gemini generateContent, model gemini-3.5-flash-lite.
- PDF parsing: unpdf, cleaning, chunking, embedding, persistence.
- Flow: import → validate/hash → extract/clean → transactionally save paper/chunks → embed → mark COMPLETED → embed query → retrieve → Gemini → validate citations → persist answer/evidence.

## Slide 5 — Database Design
- Entities: papers, authors, categories, users, roles, chunks, embeddings, searches, questions, answers.
- Bridges model M:N links: paper_authors, paper_categories, user_roles, saved_papers.
- Paper 1:N chunks; chunk 1:0/1 embedding.
- Question 1:0/1 answer; answer_evidence links answers to source chunks.
- See [database-derived ER diagram](DBMS_ER_Diagram.md).

## Slide 6 — Database Implementation
- Five migrations: core schema, indexes, functions/triggers/views, app privileges, GitHub assets.
- UUID primary keys; GitHub asset_id is bigint.
- CHECK, UNIQUE, NOT NULL, and foreign-key rules enforce data quality.
- Unique DOI/file hash prevent duplicate paper ingestion.
- paper_summary_view derives counts; completion trigger requires vectors.
- App role has DML access but cannot change roles or schema-migration records.

## Slide 7 — SQL and pgvector
- tsvector plus GIN indexes support keyword search.
- chunk_embeddings stores vector(768); dimension is constrained to 768.
- pgvector cosine distance operator is <=>; similarity is 1 − distance.
- HNSW index uses vector_cosine_ops; verified EXPLAIN selected it for nearest neighbors.
- See [read-only, verified SQL examples](DBMS_SQL_Examples.sql).

## Slide 8 — Working Demonstration
- Sign in as existing admin; show dashboard and paper library.
- Open the imported paper and confirm COMPLETED.
- Keyword query: “inter-satellite link distance line-of-sight.”
- Semantic/RAG question: “What factors constrain feasible inter-satellite links, and why can snapshot-only approaches be insufficient?”
- Answer: distance and line-of-sight constrain links; snapshot-only feasibility may fail as satellites move; optical links need steering and reacquisition.
- Stored citation IDs: a9720a7b-dc93-428f-abd1-55951694c9ec and 06bdd226-016b-4460-9145-cc32f8521de1.
- Included screenshot is the public landing page only.

## Slide 9 — Results and Testing
- Real imported PDF asset 677255871; paper COMPLETED.
- Paper ID 06a0eb33-df99-4012-a635-516b9f9c62da; 42 chunks and vectors; 768 dimensions; zero orphans.
- Matching answer status ANSWERED, model gemini-3.5-flash-lite, two citations.
- 100 automated tests passed; typecheck, lint, build, diff check passed.
- DB test suites skipped because TEST_DATABASE_URL was not set; live DB/API checks were separate.
- One paper does not establish performance at scale.

## Slide 10 — Conclusion and Future Scope
- Demonstrates relational design, SQL, constraints, joins, indexes, migrations, transactions, triggers, views, and vectors.
- Evidence references connect AI answers to actual source chunks.
- Future: disposable integration-test DB, larger corpus, quality and latency evaluation, rate-limit handling.
- GitHub release-list API returned HTTP 429 in this verification; sync was not run.
- Do not claim production scale from unit tests or one paper.
