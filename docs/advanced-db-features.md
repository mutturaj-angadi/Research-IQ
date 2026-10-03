# Advanced database features
- **Transactions:** `insertPaperWithRelations` + `replaceChunks` run in one `withTransaction`; a duplicate DOI rolls back authors, categories and chunks (tested). Embedding calls happen outside any transaction.
- **View:** `paper_summary_view` (authors, author/category/chunk counts).
- **Functions:** `get_paper_statistics(uuid)`; `set_updated_at()`, `normalize_author_name()`, `enforce_completed_requires_embeddings()` as trigger functions.
- **Triggers:** updated_at maintenance; author normalisation (makes `ON CONFLICT (normalized_name)` upserts work); COMPLETED guard (no false completion).
- **Indexes:** B-tree, composite, partial (`search_results.chunk_id`), GIN (full-text), HNSW (vector).
- **Full-text search:** generated weighted `tsvector` on papers (title A, abstract B) and chunks, `websearch_to_tsquery`, `ts_rank_cd`, `ts_headline`; chunk matches count at half weight.
- **Generated columns, CHECK, partial unique semantics, ON CONFLICT upserts, window functions** (`count(*) OVER ()` for totals, `row_number()` for per-paper caps), data-modifying CTEs.
