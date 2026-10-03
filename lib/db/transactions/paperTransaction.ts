import { run, type Db } from '../client';
import type { TextChunk } from '../../research/chunking';
import type { PaperMetadataInput } from '../../validation/schemas';

export interface NewPaperInput extends PaperMetadataInput {
  fileHash: string;
  storagePath?: string;
  uploadedBy?: string;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = name.toLowerCase();
    if (name !== '' && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/**
 * Atomic metadata write (call inside withTransaction): paper, authors, paper_authors,
 * categories, paper_categories. Any constraint violation rolls back the whole unit.
 */
export async function insertPaperWithRelations(tx: Db, input: NewPaperInput): Promise<string> {
  const [paper] = await run<{ id: string }>(
    tx,
    `INSERT INTO papers (title, abstract, publication_year, doi, venue, url, language, file_hash, storage_path, uploaded_by, processing_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PROCESSING')
     RETURNING id`,
    [
      input.title,
      input.abstract ?? null,
      input.publicationYear ?? null,
      input.doi ?? null,
      input.venue ?? null,
      input.url ?? null,
      input.language,
      input.fileHash,
      input.storagePath ?? null,
      input.uploadedBy ?? null,
    ],
  );
  const paperId = (paper as { id: string }).id;

  const authors = dedupeNames(input.authors);
  if (authors.length > 0) {
    await run(
      tx,
      `WITH input AS (
         SELECT btrim(regexp_replace(n, '\\s+', ' ', 'g')) AS full_name, ord
         FROM unnest($1::text[]) WITH ORDINALITY AS t(n, ord)
       ), ins AS (
         INSERT INTO authors (full_name) SELECT full_name FROM input
         ON CONFLICT (normalized_name) DO UPDATE SET full_name = authors.full_name
         RETURNING id, normalized_name
       )
       INSERT INTO paper_authors (paper_id, author_id, author_order)
       SELECT $2::uuid, a.id, i.ord::smallint FROM input i JOIN ins a ON a.normalized_name = lower(i.full_name)`,
      [authors, paperId],
    );
  }

  const categories = [...new Set(input.categories.map((c) => c.trim()).filter(Boolean))];
  if (categories.length > 0) {
    await run(
      tx,
      `WITH ins AS (
         INSERT INTO categories (name) SELECT unnest($1::text[])
         ON CONFLICT (name) DO UPDATE SET name = categories.name
         RETURNING id
       )
       INSERT INTO paper_categories (paper_id, category_id) SELECT $2::uuid, id FROM ins ON CONFLICT DO NOTHING`,
      [categories, paperId],
    );
  }
  return paperId;
}

export async function resetPaperForReprocessing(tx: Db, paperId: string): Promise<void> {
  await run(tx, `UPDATE papers SET processing_status = 'PROCESSING', processing_error = NULL WHERE id = $1`, [paperId]);
}

export interface StoredChunk {
  id: string;
  paperId: string;
  content: string;
  contentHash: string;
}

/** Replaces all chunks of a paper (embeddings cascade away with them) and returns the new rows. */
export async function replaceChunks(tx: Db, paperId: string, chunks: TextChunk[]): Promise<StoredChunk[]> {
  await run(tx, `DELETE FROM paper_chunks WHERE paper_id = $1`, [paperId]);
  if (chunks.length === 0) return [];
  const rows = await run<{ id: string; content: string; content_hash: string }>(
    tx,
    `INSERT INTO paper_chunks (paper_id, chunk_index, section, page_number, content, token_count, content_hash)
     SELECT $1::uuid, u.idx, u.section, u.page, u.content, u.tokens, u.hash
     FROM unnest($2::int[], $3::text[], $4::int[], $5::text[], $6::int[], $7::text[])
          AS u(idx, section, page, content, tokens, hash)
     RETURNING id, content, content_hash`,
    [
      paperId,
      chunks.map((c) => c.chunkIndex),
      chunks.map((c) => c.section),
      chunks.map((c) => c.pageNumber),
      chunks.map((c) => c.content),
      chunks.map((c) => c.tokenEstimate),
      chunks.map((c) => c.contentHash),
    ],
  );
  return rows.map((r) => ({ id: r.id, paperId, content: r.content, contentHash: r.content_hash }));
}
