# DBMS Viva Questions and Answers

## 1. What is a primary key?
A primary key uniquely identifies a row and cannot be NULL. Most ResearchIQ entities use UUID keys; bridge tables may use composite keys.

## 2. What is a foreign key?
A foreign key requires a value to reference an existing row. paper_chunks.paper_id references papers.id.

## 3. Why use UUID identifiers?
UUIDs can be generated independently and remain globally unique across imports/services. They use more index space than integer keys.

## 4. What is a composite key?
A key made from multiple columns. saved_papers uses (user_id, paper_id), preventing duplicate saves by the same user.

## 5. UNIQUE versus PRIMARY KEY?
Both enforce uniqueness. A table has one primary key as the canonical row identifier. It can have multiple UNIQUE constraints. papers has unique DOI and file hash in addition to id.

## 6. What is normalization?
Structuring relations to reduce repeated facts and update anomalies. Authors and categories are separate tables connected by junction tables.

## 7. How is 3NF reflected here?
Author names are stored once and linked to papers through paper_authors. Category names are stored once and linked through paper_categories. Search vectors and embeddings are intentional derived/search data, so do not claim no derived data exists.

## 8. Why have paper_authors?
Papers have multiple authors and authors can write multiple papers. The bridge stores each pair and author order.

## 9. Why use DB constraints if the API validates?
API validation can give friendly errors, but database CHECK, UNIQUE, and FK rules protect integrity for every write path.

## 10. Explain CASCADE, RESTRICT, SET NULL.
CASCADE deletes dependent rows such as chunks with a paper. RESTRICT blocks deletion of referenced entities. SET NULL preserves history when a user is removed.

## 11. What is a transaction?
A group of statements committed or rolled back together. Paper/chunk writes and answer/evidence writes are transactional.

## 12. Why not keep a DB transaction open during model calls?
Network requests can be slow or fail. Ingestion commits paper/chunks, then calls the embedding service, then marks completion after vectors are stored.

## 13. What is an index?
A structure that speeds reads but uses space and adds write maintenance. ResearchIQ uses B-tree, GIN, and HNSW indexes.

## 14. What does GIN do here?
GIN indexes generated tsvector values for PostgreSQL full-text search on papers and chunks.

## 15. What is pgvector?
A PostgreSQL extension for vector types, distance operators, and vector indexes. ResearchIQ stores vector(768).

## 16. What is an embedding?
A numeric representation of text from an embedding model. Semantically related text should be close in vector space; a vector is not a key or readable summary.

## 17. How does cosine search work?
The query is embedded and ordered against stored vectors with <=>. Smaller cosine distance is closer; API similarity is one minus distance.

## 18. What is HNSW?
A graph-based approximate nearest-neighbor index. It can speed larger searches but trades some recall for speed; PostgreSQL may choose another plan for small or filtered datasets.

## 19. Why separate chunk_embeddings?
It separates derived vector data and model/version/hash metadata from source text. chunk_id is both PK and FK, giving at most one current embedding per chunk.

## 20. How are citations tied to real evidence?
answer_evidence has foreign keys to answers and paper_chunks. App logic maps only citations to retrieved source numbers before persistence.

## 21. What does answer_evidence represent?
A junction relation between answers and source chunks, with rank and retrieval score stored on the relationship.

## 22. How does duplicate ingestion get detected?
The app computes a SHA-256 file hash, and papers.file_hash is UNIQUE. A completed duplicate returns DUPLICATE. DOI is also unique.

## 23. What is a migration?
A versioned SQL schema change. scripts/migrate.ts applies sorted unapplied .up.sql files and records names. Migrations 001–005 are applied.

## 24. What is a view?
A named query. paper_summary_view joins metadata with author names and author/category/chunk counts without storing repeated counts on each paper.

## 25. Why JSONB for search filters?
Filter combinations vary. JSONB stores the validated filter object flexibly while core entities remain relational.

## 26. Explain RAG.
Retrieval-Augmented Generation retrieves relevant chunks first and then supplies them to a language model. ResearchIQ stores the answer and foreign-key links to cited chunks.

## 27. Keyword versus semantic search?
Keyword search matches terms through tsvector. Semantic search compares embeddings and can find different wording with similar meaning.

## 28. Why PostgreSQL instead of a separate vector DB?
One database stores vectors alongside metadata and joins, constraints, history, and evidence. A separate service can be considered if measured scale requires it.

## 29. What does the completion trigger guarantee?
A paper cannot become COMPLETED without at least one chunk and an embedding for every chunk.

## 30. What are the current limitations?
The verified database contains one paper, so scale is not established. Automated DB suites need a disposable TEST_DATABASE_URL, which was not configured. The GitHub release listing API returned HTTP 429 in this verification.
