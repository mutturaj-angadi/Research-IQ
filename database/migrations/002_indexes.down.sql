BEGIN;
DROP INDEX IF EXISTS idx_papers_year, idx_papers_status, idx_papers_created, idx_papers_fts,
  idx_paper_authors_author, idx_paper_categories_category, idx_chunks_paper_page,
  idx_chunks_paper_section, idx_chunks_fts, idx_chunk_embeddings_hnsw, idx_chunk_embeddings_model,
  idx_search_queries_user_created, idx_search_results_paper, idx_search_results_chunk,
  idx_questions_user_created, idx_answer_evidence_chunk, idx_saved_papers_paper;
COMMIT;
