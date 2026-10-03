# Vector search architecture

1. **What is embedded:** each `paper_chunks.content` (about 1200 characters, section-bounded). Queries are embedded at search time.
2. **Why:** semantic matching finds relevant passages even without shared keywords, and each hit is a real chunk that can be cited.
3. **Model:** configurable via `EMBEDDING_MODEL`; default `text-embedding-3-small` requested with `dimensions=768`. Any OpenAI-compatible `/embeddings` provider works; the code depends only on the `EmbeddingService` interface.
4. **Dimension:** 768, fixed by `vector(768)` and a CHECK. Changing it needs a new migration and a full re-embed.
5. **Storage:** `chunk_embeddings.embedding`, one row per chunk, with model, dimension, version and the content hash it was computed from.
6. **Metric:** cosine distance everywhere (`<=>`, `vector_cosine_ops`); similarity = 1 - distance. Vectors are L2-normalised before storage.
7. **Index:** HNSW. It needs no training data (IVFFlat does) and handles a growing corpus. At seed scale (tens of rows) PostgreSQL will choose an exact scan, which is correct and fast.
8. **Metadata:** every result carries paper id/title, chunk id, page, section, authors, year, venue.
9. **Retrieval:** validate -> embed query -> one SQL statement (filters + nearest chunks + per-paper cap + similarity threshold) -> DTOs.
10. **Top-K:** default 8, max 20 (`lib/limits.ts`); at most 3 chunks per paper (configurable per request) so one paper cannot crowd out others; results below `minSimilarity` (default 0.25) are dropped, which is how "no evidence" is detected.
11. **Filtering:** year range, category, author, venue and paper IDs are SQL predicates (bound parameters), not application-side filtering. HNSW is approximate and filters apply after the scan; the search sets `hnsw.ef_search = 100` and enables `hnsw.iterative_scan` when pgvector >= 0.8.
12. **Re-embedding:** a chunk is stale when its embedding's `model` differs from the configured model or its `content_hash` differs from the chunk's. `npm run embed` / `npm run reindex` re-embed stale chunks (bumping `embedding_version`); searches only consider vectors from the current model, so mixed spaces never compare.
13. **Failure handling:** batches retry on 429/5xx/network errors with backoff; bad credentials fail fast; wrong dimensions are rejected. A failed ingest sets the paper to FAILED and keeps already-stored batches, so a retry only embeds what is missing.

Evidence rule: results come only from `paper_chunks` rows; nothing is generated. If nothing passes the threshold the response has `noEvidence: true`.
