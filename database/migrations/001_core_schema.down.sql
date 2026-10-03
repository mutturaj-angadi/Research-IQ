BEGIN;
DROP TABLE IF EXISTS saved_papers, answer_evidence, answers, questions, search_results,
    search_queries, chunk_embeddings, paper_chunks, paper_categories, categories,
    paper_authors, authors, papers, user_roles, users, roles CASCADE;
DROP EXTENSION IF EXISTS vector;
COMMIT;
