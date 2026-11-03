# Database Analysis — Verified PostgreSQL Schema

## Environment and live state

- PostgreSQL 16.15; database researchiq_dev; app connection port 5433; role researchiq_app.
- pgvector 0.6.0.
- Migrations verified with local PostgreSQL administrative access: 001_core_schema, 002_indexes, 003_functions_triggers_views, 004_app_role_privileges, 005_github_release_assets.
- One completed paper, 42 chunks, 42 embeddings, dimensions 768, zero orphan embeddings.
- Stored embedding model is gemini-embedding-001.
- App role cannot read schema_migrations by design.

## Tables and columns

Types are from the live catalog. Unless marked nullable, fields are NOT NULL. Timestamps are timestamptz.

| Table | Purpose and columns |
|---|---|
| roles | Role catalogue: id smallint identity PK; name text UNIQUE and restricted to ADMIN/RESEARCHER; description text. |
| users | Accounts: id uuid PK; email text UNIQUE/lowercase/validated; password_hash text; full_name text; is_active boolean default true; created_at and updated_at timestamptz. |
| user_roles | Bridge: user_id uuid FK; role_id smallint FK; composite PK(user_id, role_id). |
| papers | Metadata/state: id uuid PK; title text; nullable abstract text, publication_year smallint, doi text UNIQUE, venue text, url text, file_hash char(64) UNIQUE, storage_path text, processing_error text, uploaded_by uuid FK; language text default en; citation_count integer default 0; processing_status text default PENDING; generated stored search_vector tsvector (no explicit NOT NULL declaration); created_at/updated_at timestamptz. |
| authors | id uuid PK; full_name text; normalized_name text UNIQUE; created_at timestamptz. |
| paper_authors | paper_id uuid FK; author_id uuid FK; author_order smallint; PK(paper_id, author_id), UNIQUE(paper_id, author_order). |
| categories | id integer identity PK; name text UNIQUE; nullable description text. |
| paper_categories | paper_id uuid FK; category_id integer FK; composite PK. |
| paper_chunks | id uuid PK; paper_id uuid FK; chunk_index integer; nullable section text, page_number integer, token_count integer; content text; content_hash char(64); generated stored search_vector tsvector (no explicit NOT NULL declaration); created_at/updated_at timestamptz; UNIQUE(paper_id, chunk_index) and UNIQUE(paper_id, content_hash). |
| chunk_embeddings | chunk_id uuid PK and FK; embedding vector(768); model text; dimension integer CHECK 768; embedding_version integer default 1; content_hash char(64); created_at timestamptz. |
| search_queries | id uuid PK; nullable user_id uuid FK; query_text text; search_type text CHECK KEYWORD/SEMANTIC; filters jsonb default {}; result_count integer; created_at timestamptz. |
| search_results | id uuid PK; search_query_id uuid FK; paper_id uuid FK; nullable chunk_id uuid FK; rank integer; score double precision; UNIQUE(search_query_id, rank). |
| questions | id uuid PK; nullable user_id uuid FK; question_text text; created_at timestamptz. |
| answers | id uuid PK; question_id uuid FK and UNIQUE; answer_text text; status text CHECK ANSWERED/NO_EVIDENCE/FAILED; nullable model text; created_at timestamptz. ANSWERED requires nonblank text. |
| answer_evidence | answer_id uuid FK; chunk_id uuid FK; rank integer; relevance_score double precision; PK(answer_id, chunk_id); UNIQUE(answer_id, rank). |
| saved_papers | user_id uuid FK; paper_id uuid FK; created_at timestamptz; composite PK(user_id, paper_id). |
| github_release_assets | External asset tracking: repository text; asset_id bigint PK; release_id bigint; release_tag/release_name text; release_draft/release_prerelease boolean; filename/download_url/content_type text; asset_size bigint; nullable checksum char(64), paper_id uuid FK, processing_error text, last_attempt_at/processed_at timestamptz, last_attempt_by/last_synced_by uuid FKs; processing_status text; attempt_count integer; discovered_at/updated_at timestamptz. COMPLETED requires paper_id. |
| schema_migrations | Operational ledger: name text PK; applied_at timestamptz default now(); not accessible to app role. |
| paper_summary_view | View, not base table: metadata/status plus ordered author string and author/category/chunk counts. |

## Relationships and referential integrity

- papers 1:N paper_chunks; each chunk 0:1 chunk_embeddings.
- papers M:N authors through paper_authors; author_order preserves order.
- papers M:N categories through paper_categories.
- users M:N roles through user_roles.
- search_queries 1:N search_results; each result points to a paper and may point to a chunk.
- questions 1:0/1 answers; answers M:N cited chunks through answer_evidence.
- users M:N papers through saved_papers.
- GitHub assets may exist before import; paper_id is nullable, and deletion of linked paper is RESTRICTed.
- Paper deletion cascades to chunks, embeddings, bridges, saves, search results, and evidence. Author/category/role references are RESTRICTed. Some user history/upload refs use SET NULL.

## Constraints and normalization

- Roles are limited to ADMIN/RESEARCHER. User email is lowercase and email-shaped; password_hash has a minimum length; full_name is nonblank. Author names are normalized by trigger and normalized_name is UNIQUE; category names are UNIQUE and nonblank.
- Paper title nonblank and ≤1000 chars; status limited to PENDING/PROCESSING/COMPLETED/FAILED; error only when FAILED.
- DOI lower-case and format-checked; DOI/file hash UNIQUE; file hash is 64-hex SHA-256.
- Year 1900–2100; citation count nonnegative; language 2–3 lowercase letters.
- Chunk index nonnegative; content nonblank; page/token count positive when present; index and content hash unique per paper.
- Vector type is vector(768), dimension CHECK is 768, chunk_id PK permits one current vector per chunk.
- Query/question lengths and search/answer statuses are checked. ANSWERED text must be nonblank.
- Search query type is KEYWORD/SEMANTIC, result_count is nonnegative, and result rank is positive and unique within a search. Question text length is 1–2000; saved_papers composite key prevents duplicate saves.
- Evidence rank is positive and unique per answer; FKs require the answer and chunk to exist.
- GitHub asset ID/release ID/size must be positive; repository, URL, filename, checksum, and processing status are checked. A completed asset must reference a paper; an error is allowed only for FAILED.
- Completion trigger requires at least one chunk and an embedding for every chunk.
- Separate authors/categories and bridge tables avoid repeating lists. Vectors and tsvectors are deliberate derived search data; JSONB stores flexible filters.
- Integrity limitation: search_results stores paper_id and nullable chunk_id as separate FKs; no composite constraint ensures that the chunk belongs to that paper. Application retrieval supplies aligned IDs.

## Indexes and programmable database objects

- B-tree indexes: idx_papers_year/status/created; idx_paper_authors_author; idx_paper_categories_category; idx_chunks_paper_page/section; idx_chunk_embeddings_model; idx_search_queries_user_created; idx_search_results_paper/chunk; idx_questions_user_created; idx_answer_evidence_chunk; idx_saved_papers_paper; idx_github_release_assets_status/paper.
- GIN: papers.search_vector and paper_chunks.search_vector.
- HNSW: idx_chunk_embeddings_hnsw on embedding vector_cosine_ops. The search_results chunk index is partial, for rows where chunk_id is not NULL.
- set_updated_at maintains user, paper, and chunk timestamps.
- normalize_author_name collapses whitespace and lowercases normalized name.
- enforce_completed_requires_embeddings guards the completion transition.
- paper_summary_view returns metadata and counts.
- get_paper_statistics(uuid) returns chunks, embedded chunks, retrievals, evidence, and saves.
- EXPLAIN selected the HNSW index for a verified nearest-neighbour form; plans depend on query filters and statistics.

## Transactions, migrations, privileges

Paper metadata/chunks are written transactionally. Provider calls happen outside that transaction; status changes to COMPLETED only after embeddings persist. Ask persists question, answer, and evidence in one transaction. Failures keep FAILED/NO_EVIDENCE states; no status is manually promoted.

scripts/migrate.ts creates the migration ledger, applies sorted unapplied up migrations, and records names. A down run only reverses the latest applied migration and was not used. App role has DML but cannot modify the role catalogue or access the migration ledger.

## Why PostgreSQL and pgvector?

PostgreSQL provides transactions, keys, constraints, JSONB, generated columns, full-text search, views, triggers, and indexes. pgvector adds vector columns/operators/indexes in the same database, enabling joins from retrieved chunks to paper and citation metadata without syncing a second store. Evaluate latency, recall, memory, and maintenance at larger scale before changing architecture.

## Verified record

- Paper 06a0eb33-df99-4012-a635-516b9f9c62da, COMPLETED.
- GitHub asset 677255871 from mutturaj-angadi/Research-IQ; 2,283,875 bytes; COMPLETED.
- PDF: 10.1109_aero66936.2026.11519907__Inter-Satellite_Link_Configuration_for_Fast_Delivery_in_Low-Earth-Orbit_Constellations.pdf.
- 42 chunks / 42 vectors; dimension 768; model gemini-embedding-001.
- Matching answer ANSWERED by gemini-3.5-flash-lite; two evidence relations.
