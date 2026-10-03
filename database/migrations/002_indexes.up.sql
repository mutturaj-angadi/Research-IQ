-- 002_indexes: every index maps to a query pattern (noted per line).
BEGIN;
-- papers: filter by year, admin lists by status, newest-first pagination, keyword search
CREATE INDEX idx_papers_year        ON papers (publication_year);
CREATE INDEX idx_papers_status      ON papers (processing_status);
CREATE INDEX idx_papers_created     ON papers (created_at DESC);
CREATE INDEX idx_papers_fts         ON papers USING gin (search_vector);
-- junction tables: PK covers paper-first lookups; these cover author/category-first lookups
CREATE INDEX idx_paper_authors_author     ON paper_authors (author_id);
CREATE INDEX idx_paper_categories_category ON paper_categories (category_id);
-- chunks: section/page lookup per paper, chunk-level keyword search
CREATE INDEX idx_chunks_paper_page    ON paper_chunks (paper_id, page_number);
CREATE INDEX idx_chunks_paper_section ON paper_chunks (paper_id, section);
CREATE INDEX idx_chunks_fts           ON paper_chunks USING gin (search_vector);
-- vector: cosine distance (embeddings are normalised); HNSW needs no training data, suits a growing corpus
CREATE INDEX idx_chunk_embeddings_hnsw ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);
-- stale-embedding scans
CREATE INDEX idx_chunk_embeddings_model ON chunk_embeddings (model, embedding_version);
-- history pages and analytics
CREATE INDEX idx_search_queries_user_created ON search_queries (user_id, created_at DESC);
CREATE INDEX idx_search_results_paper        ON search_results (paper_id);
CREATE INDEX idx_search_results_chunk        ON search_results (chunk_id) WHERE chunk_id IS NOT NULL;
CREATE INDEX idx_questions_user_created      ON questions (user_id, created_at DESC);
CREATE INDEX idx_answer_evidence_chunk       ON answer_evidence (chunk_id);
CREATE INDEX idx_saved_papers_paper          ON saved_papers (paper_id);
COMMIT;
