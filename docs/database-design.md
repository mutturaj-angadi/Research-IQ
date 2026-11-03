# Database design

PostgreSQL 16 + pgvector. Migrations in `database/migrations` are the single source of truth; `database/schema.sql` is generated from them.

## Entities and why each exists
| Table | Purpose |
|---|---|
| users, roles, user_roles | Accounts and RBAC (ADMIN, RESEARCHER). Stores only a password **hash**; hashing is done by Member 2's auth layer. |
| papers | One row per research paper: metadata, processing state, `file_hash` for duplicate detection, weighted full-text vector. |
| authors, paper_authors | N:M paper-author with `author_order`. Authors are matched on a normalised name. |
| categories, paper_categories | N:M paper-category. |
| paper_chunks | Retrievable text units with section, page and hash. The unit of evidence. |
| chunk_embeddings | One current vector per chunk plus model, dimension, version and the content hash it was computed from. |
| search_queries, search_results | Search history and ranked results (analytics: most searched/retrieved). |
| questions, answers, answer_evidence | Question -> answer -> evidence chunks. Evidence is stored separately from answer text. |
| saved_papers | A user's saved papers. |
| github_release_assets | External GitHub release asset metadata and import lifecycle linked to the resulting paper; PDF bytes are not persisted. |

Not created (no justified purpose): citations, publishers, journals, conferences, processing_jobs, audit_logs. `venue` replaces journals/conferences; `papers.processing_status/error` replaces a general jobs table. GitHub source imports are tracked with the focused `github_release_assets` relation introduced in migration 005.

## Normalisation (3NF)
- Authors and categories are separate entities with junction tables (no repeated names, no comma lists).
- Every non-key column depends on the key only: e.g. `chunk_embeddings` holds model/version per chunk, not per paper.
- Deliberate exceptions: `search_queries.filters` is JSONB because filters are a variable parameter set, not an entity; `papers.search_vector` and `paper_chunks.search_vector` are generated columns (derived, kept consistent by PostgreSQL); `chunk_embeddings.content_hash` copies the chunk hash on purpose, to detect stale vectors.
- Known limitation: two different people with the same normalised name share one `authors` row (no ORCID column).

## Referential actions
- Paper deleted -> chunks, embeddings, junction rows, search results and answer evidence cascade away (no orphan vectors).
- User deleted -> saved papers cascade; search history, questions and uploads keep the row with `user_id` set to NULL.
- Authors, categories and roles are `RESTRICT` while referenced.

## Integrity rules enforced in the database
Non-empty title; year 1900-2100; lower-case DOI format and uniqueness; allowed `processing_status` values; `processing_error` only when FAILED; non-negative counts; `author_order >= 1` and unique per paper; one chunk index and one content hash per paper; vector dimension fixed at 768; one answer per question; unique saves; a paper cannot become COMPLETED unless it has chunks and every chunk has an embedding (trigger).
