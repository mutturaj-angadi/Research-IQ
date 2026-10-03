-- ResearchIQ SQL query collection. Run against a migrated + seeded database (psql -f).
-- Queries 20 (vector search) and 5-6 that need embeddings work after `npm run embed`.

-- 1. Basic SELECT: newest completed papers for the library page.
SELECT id, title, publication_year, venue FROM papers WHERE processing_status = 'COMPLETED' ORDER BY created_at DESC LIMIT 10;

-- 2. INSERT: a researcher saves a paper (idempotent).
INSERT INTO saved_papers (user_id, paper_id)
SELECT u.id, p.id FROM users u, papers p
WHERE u.email = 'researcher@researchiq.local' AND p.doi = '10.48550/arxiv.1412.6980'
ON CONFLICT DO NOTHING;

-- 3. UPDATE: correct a paper's venue after review.
UPDATE papers SET venue = 'ICLR' WHERE doi = '10.48550/arxiv.1412.6980';

-- 4. DELETE: researcher un-saves a paper.
DELETE FROM saved_papers
WHERE user_id = (SELECT id FROM users WHERE email = 'researcher@researchiq.local')
  AND paper_id = (SELECT id FROM papers WHERE doi = '10.48550/arxiv.1412.6980');

-- 5. INNER JOIN: papers with their ordered authors.
SELECT p.title, a.full_name, pa.author_order
FROM papers p JOIN paper_authors pa ON pa.paper_id = p.id JOIN authors a ON a.id = pa.author_id
WHERE p.doi = '10.48550/arxiv.2004.04906' ORDER BY pa.author_order;

-- 6. LEFT JOIN: papers that have no chunks yet (ingestion backlog).
SELECT p.id, p.title, p.processing_status
FROM papers p LEFT JOIN paper_chunks c ON c.paper_id = p.id WHERE c.id IS NULL;

-- 7. Multi-table JOIN: category browser with author names.
SELECT cat.name AS category, p.title, string_agg(a.full_name, ', ' ORDER BY pa.author_order) AS authors
FROM categories cat
JOIN paper_categories pc ON pc.category_id = cat.id
JOIN papers p ON p.id = pc.paper_id
JOIN paper_authors pa ON pa.paper_id = p.id
JOIN authors a ON a.id = pa.author_id
GROUP BY cat.name, p.id, p.title ORDER BY cat.name, p.title;

-- 8. GROUP BY + aggregate: papers per publication year.
SELECT publication_year, count(*) AS papers FROM papers GROUP BY publication_year ORDER BY publication_year;

-- 9. HAVING: prolific authors (more than one paper in the library).
SELECT a.full_name, count(*) AS papers
FROM authors a JOIN paper_authors pa ON pa.author_id = a.id
GROUP BY a.id, a.full_name HAVING count(*) > 1 ORDER BY papers DESC, a.full_name;

-- 10. ORDER BY + aggregate: papers per category.
SELECT c.name, count(pc.paper_id) AS papers
FROM categories c LEFT JOIN paper_categories pc ON pc.category_id = c.id
GROUP BY c.id, c.name ORDER BY papers DESC, c.name;

-- 11. Aggregate: average authors per paper.
SELECT round(avg(n), 2) AS avg_authors_per_paper
FROM (SELECT count(*) AS n FROM paper_authors GROUP BY paper_id) t;

-- 12. Subquery: papers with more authors than the average.
SELECT p.title, count(*) AS authors
FROM papers p JOIN paper_authors pa ON pa.paper_id = p.id
GROUP BY p.id, p.title
HAVING count(*) > (SELECT avg(n) FROM (SELECT count(*) AS n FROM paper_authors GROUP BY paper_id) t)
ORDER BY authors DESC;

-- 13. EXISTS: papers the researcher has saved.
SELECT p.title FROM papers p
WHERE EXISTS (SELECT 1 FROM saved_papers sp JOIN users u ON u.id = sp.user_id
              WHERE sp.paper_id = p.id AND u.email = 'researcher@researchiq.local');

-- 14. Full-text search with weighted ranking (title A, abstract B) and highlighted snippet.
SELECT p.title, ts_rank_cd(p.search_vector, q) AS rank,
       ts_headline('english', p.abstract, q, 'MaxFragments=1, MaxWords=25') AS snippet
FROM papers p, websearch_to_tsquery('english', 'dense retrieval question answering') q
WHERE p.search_vector @@ q ORDER BY rank DESC LIMIT 5;

-- 15. View usage: library listing.
SELECT title, authors, author_count, category_count, chunk_count FROM paper_summary_view ORDER BY publication_year, title;

-- 16. Transaction: atomic paper + author + category insert; the failing last statement rolls everything back.
BEGIN;
  INSERT INTO papers (title, doi, publication_year) VALUES ('Transaction demo paper', '10.9999/demo.tx', 2024);
  INSERT INTO authors (full_name) VALUES ('Demo Author') ON CONFLICT (normalized_name) DO NOTHING;
  INSERT INTO paper_authors (paper_id, author_id, author_order)
    SELECT p.id, a.id, 1 FROM papers p, authors a WHERE p.doi = '10.9999/demo.tx' AND a.normalized_name = 'demo author';
  INSERT INTO papers (title, doi) VALUES ('Duplicate DOI', '10.9999/demo.tx');   -- violates UNIQUE(doi)
ROLLBACK;  -- psql aborts the txn on the error; ROLLBACK leaves no partial data
SELECT count(*) AS leftover FROM papers WHERE doi = '10.9999/demo.tx';  -- 0

-- 17. Stored function: statistics for one paper.
SELECT * FROM get_paper_statistics((SELECT id FROM papers WHERE doi = '10.48550/arxiv.2005.11401'));

-- 18. Trigger behaviour: COMPLETED is refused while chunks lack embeddings.
DO $$
BEGIN
    UPDATE papers SET processing_status = 'COMPLETED' WHERE doi = '10.48550/arxiv.1706.03762' AND processing_status = 'PENDING';
    RAISE NOTICE 'status updated (chunks were embedded)';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'trigger blocked COMPLETED: %', SQLERRM;
END $$;

-- 19. Index-supported query: composite filter served by idx_papers_year / idx_papers_status.
EXPLAIN SELECT id, title FROM papers WHERE publication_year BETWEEN 2019 AND 2020 AND processing_status = 'COMPLETED';

-- 20. Vector similarity search: papers closest to a given chunk (related-papers recommendation, cosine).
WITH seed AS (
    SELECT e.embedding FROM chunk_embeddings e JOIN paper_chunks c ON c.id = e.chunk_id
    JOIN papers p ON p.id = c.paper_id WHERE p.doi = '10.48550/arxiv.2005.11401' AND c.chunk_index = 0)
SELECT p.title, c.section, c.page_number, round((1 - (e.embedding <=> s.embedding))::numeric, 3) AS similarity
FROM seed s, chunk_embeddings e JOIN paper_chunks c ON c.id = e.chunk_id JOIN papers p ON p.id = c.paper_id
WHERE p.doi <> '10.48550/arxiv.2005.11401'
ORDER BY e.embedding <=> s.embedding LIMIT 5;

-- ---------- Analytics ----------
-- A1. Papers by processing status.
SELECT processing_status, count(*) FROM papers GROUP BY processing_status ORDER BY count(*) DESC;

-- A2. Most searched topics.
SELECT lower(query_text) AS topic, count(*) AS searches FROM search_queries GROUP BY lower(query_text) ORDER BY searches DESC, topic LIMIT 10;

-- A3. Most retrieved papers (search results + evidence usage).
SELECT p.title, count(DISTINCT sr.id) AS times_retrieved, count(DISTINCT ae.answer_id) AS times_cited
FROM papers p
LEFT JOIN search_results sr ON sr.paper_id = p.id
LEFT JOIN paper_chunks c ON c.paper_id = p.id
LEFT JOIN answer_evidence ae ON ae.chunk_id = c.id
GROUP BY p.id, p.title HAVING count(DISTINCT sr.id) > 0 ORDER BY times_retrieved DESC, p.title;

-- A4. Search and question volume per day.
SELECT d::date AS day,
       (SELECT count(*) FROM search_queries s WHERE s.created_at::date = d::date) AS searches,
       (SELECT count(*) FROM questions q WHERE q.created_at::date = d::date) AS questions
FROM generate_series(now() - interval '7 days', now(), interval '1 day') d ORDER BY day;

-- A5. Evidence retrieved per paper and section.
SELECT p.title, c.section, count(*) AS evidence_rows
FROM answer_evidence ae JOIN paper_chunks c ON c.id = ae.chunk_id JOIN papers p ON p.id = c.paper_id
GROUP BY p.title, c.section ORDER BY evidence_rows DESC;

-- A6. Stale embeddings (wrong model or outdated text) - what `npm run reindex` repairs.
SELECT c.id, e.model, e.embedding_version
FROM paper_chunks c JOIN chunk_embeddings e ON e.chunk_id = c.id
WHERE e.model <> 'text-embedding-3-small' OR e.content_hash <> c.content_hash;
