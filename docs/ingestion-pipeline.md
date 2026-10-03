# Ingestion pipeline (`lib/research/ingest.ts`)

validate upload -> SHA-256 -> duplicate check -> extract text per page (unpdf) -> clean -> chunk -> detect metadata
-> **one transaction**: paper + authors + categories + chunks -> embed batches (no transaction open) -> COMPLETED.

- **Validation:** `.pdf` name without path separators, MIME `application/pdf`, size 1 byte..20 MB, `%PDF-` magic bytes.
- **Cleaning:** NFKC (ligatures), control characters, de-hyphenation, running headers/footers (short lines repeated in the first/last two lines of >= 60% of pages), page numbers. Page positions are preserved.
- **Chunking:** deterministic; section detection by heading patterns; 1200 chars / 200 overlap (env-configurable); never crosses a section; skips References; duplicate chunk text dropped. Page = page of the first new text.
- **Metadata:** title, DOI, year and abstract are best-effort heuristics; authors/categories come from caller-supplied metadata. Caller metadata overrides detection.
- **Idempotency:** same file hash + COMPLETED -> `DUPLICATE`, no re-embedding. FAILED (or PROCESSING older than 15 min) -> `REPROCESSED`: old chunks are deleted (embeddings cascade) and rebuilt. Same DOI with a different file -> `DUPLICATE_RESOURCE`.
- **Failure rules:** unreadable/empty PDFs create no row. Embedding failures leave the paper FAILED with a safe error code; the database trigger blocks COMPLETED if any chunk lacks a vector.
- **Logging:** start/end, duplicate, failure with error name/code and duration. No file contents, URLs or secrets.
