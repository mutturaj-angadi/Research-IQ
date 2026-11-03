-- Safe, read-only ResearchIQ SQL examples verified on researchiq_dev.
-- Run with a PostgreSQL administrative/read-only account; app role cannot SELECT schema_migrations.
-- Do not run against dbms_class. All data statements are SELECT or EXPLAIN in read-only mode.
\set ON_ERROR_STOP on
\set paper_id '06a0eb33-df99-4012-a635-516b9f9c62da'
BEGIN READ ONLY;

-- 1. List papers and processing status.
SELECT id,title,publication_year,processing_status FROM papers ORDER BY created_at DESC;

-- 2. Count chunks and embeddings without join multiplication.
SELECT p.id,p.title,count(DISTINCT c.id) AS chunks,count(DISTINCT e.chunk_id) AS embeddings
FROM papers p LEFT JOIN paper_chunks c ON c.paper_id=p.id
LEFT JOIN chunk_embeddings e ON e.chunk_id=c.id
GROUP BY p.id,p.title ORDER BY p.title;

-- 3. Inspect first five extracted passages.
SELECT id AS chunk_id,chunk_index,page_number,section,left(content,300) AS excerpt
FROM paper_chunks WHERE paper_id=:'paper_id'::uuid ORDER BY chunk_index LIMIT 5;

-- 4. Verify vector model and dimensions.
SELECT e.model,count(*) AS embeddings,min(vector_dims(e.embedding)) AS min_dimension,
       max(vector_dims(e.embedding)) AS max_dimension
FROM paper_chunks c JOIN chunk_embeddings e ON e.chunk_id=c.id
WHERE c.paper_id=:'paper_id'::uuid GROUP BY e.model;

-- 5. Missing vectors (expected no rows).
SELECT c.id AS missing_embedding_chunk FROM paper_chunks c
LEFT JOIN chunk_embeddings e ON e.chunk_id=c.id
WHERE c.paper_id=:'paper_id'::uuid AND e.chunk_id IS NULL;

-- 6. Orphan vectors (expected no rows; FK also prevents them).
SELECT e.chunk_id AS orphan_embedding FROM chunk_embeddings e
LEFT JOIN paper_chunks c ON c.id=e.chunk_id WHERE c.id IS NULL;

-- 7. Persisted answers and their actual cited passages.
SELECT q.id AS question_id,q.question_text,a.id AS answer_id,a.status,a.model,
       ae.rank,ae.relevance_score,p.id AS paper_id,p.title,c.id AS chunk_id,
       c.page_number,c.section,left(c.content,300) AS evidence
FROM questions q JOIN answers a ON a.question_id=q.id
LEFT JOIN answer_evidence ae ON ae.answer_id=a.id
LEFT JOIN paper_chunks c ON c.id=ae.chunk_id
LEFT JOIN papers p ON p.id=c.paper_id
ORDER BY a.created_at DESC,ae.rank;

-- 8. Nearest neighbours using a stored chunk vector as a demonstration query vector.
-- The app instead embeds the user's natural-language query.
WITH seed AS MATERIALIZED (
  SELECT e.embedding,e.model FROM chunk_embeddings e JOIN paper_chunks c ON c.id=e.chunk_id
  WHERE c.paper_id=:'paper_id'::uuid ORDER BY c.chunk_index LIMIT 1
)
SELECT c.id AS chunk_id,c.chunk_index,c.page_number,
       e.embedding <=> seed.embedding AS cosine_distance,
       1-(e.embedding <=> seed.embedding) AS similarity
FROM seed JOIN chunk_embeddings e ON e.model=seed.model
JOIN paper_chunks c ON c.id=e.chunk_id
WHERE c.paper_id=:'paper_id'::uuid
ORDER BY e.embedding <=> seed.embedding LIMIT 5;

-- 9. Inspect whether PostgreSQL selects the HNSW nearest-neighbour index.
EXPLAIN
SELECT c.id
FROM chunk_embeddings e
JOIN paper_chunks c ON c.id=e.chunk_id
ORDER BY e.embedding <=> (SELECT embedding FROM chunk_embeddings LIMIT 1)
LIMIT 5;

-- 10. Full-text search against generated tsvector.
SELECT c.id AS chunk_id,p.title,
       ts_rank_cd(c.search_vector,plainto_tsquery('english','inter-satellite link')) AS rank,
       left(c.content,220) AS excerpt
FROM paper_chunks c JOIN papers p ON p.id=c.paper_id
WHERE c.search_vector @@ plainto_tsquery('english','inter-satellite link')
ORDER BY rank DESC LIMIT 10;

-- 11. Applied migration versions; app role intentionally cannot read this ledger.
SELECT name,applied_at FROM schema_migrations ORDER BY name;
COMMIT;
