import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { AppError } from '../../lib/errors';
import { IngestionPipeline } from '../../lib/research/ingest';
import { sha256Hex } from '../../lib/research/upload';
import { FailingEmbeddingService, FakeEmbeddingService } from '../helpers/fakes';
import { HAS_DB, closePool, getPool } from '../helpers/db';

const pages = [
  `Evidence Grounded Retrieval\n\nAbstract\n${'We study grounded retrieval of evidence for questions. '.repeat(3)}\n\n1 Introduction\n${Array.from({ length: 30 }, (_, i) => `Sentence ${i} explains retrieval grounding.`).join(' ')}`,
];
const extractor = async () => pages;
const options = { chunkSize: 500, overlap: 50 };
const created: string[] = [];

const newPdf = () => {
  const buffer = Buffer.from(`%PDF-1.7 ${randomUUID()}`);
  created.push(sha256Hex(buffer));
  return { buffer, fileName: 'paper.pdf', mimeType: 'application/pdf', metadata: { title: `Ingest test ${randomUUID()}`, authors: ['Test Author'], categories: ['Testing'] } };
};

describe('ingestion pipeline', { skip: !HAS_DB }, () => {
  after(async () => {
    await getPool().query(`DELETE FROM papers WHERE file_hash = ANY($1)`, [created]);
    await closePool();
  });

  const pipeline = (embeddings = new FakeEmbeddingService(), extractPages = extractor) =>
    new IngestionPipeline({ db: getPool(), embeddings, extractPages, chunkOptions: options });
  const status = async (id: string) => (await getPool().query(`SELECT processing_status AS s, processing_error AS e FROM papers WHERE id = $1`, [id])).rows[0];

  it('ingests a valid PDF: chunks, embeddings and COMPLETED status agree', async () => {
    const result = await pipeline().ingest(newPdf());
    assert.equal(result.outcome, 'INGESTED');
    assert.equal((await status(result.paperId)).s, 'COMPLETED');
    const counts = (await getPool().query(
      `SELECT count(c.id) AS chunks, count(e.chunk_id) AS embeddings FROM paper_chunks c LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id WHERE c.paper_id = $1`, [result.paperId])).rows[0];
    assert.equal(Number(counts.chunks), result.chunkCount);
    assert.equal(counts.chunks, counts.embeddings);
    const rel = (await getPool().query(`SELECT (SELECT count(*) FROM paper_authors WHERE paper_id = $1) AS a, (SELECT count(*) FROM paper_categories WHERE paper_id = $1) AS c`, [result.paperId])).rows[0];
    assert.deepEqual([Number(rel.a), Number(rel.c)], [1, 1]);
  });

  it('detects duplicates without re-embedding', async () => {
    const input = newPdf();
    const embeddings = new FakeEmbeddingService();
    const first = await pipeline(embeddings).ingest(input);
    const callsAfterFirst = embeddings.calls;
    const second = await pipeline(embeddings).ingest(input);
    assert.equal(second.outcome, 'DUPLICATE');
    assert.equal(second.paperId, first.paperId);
    assert.equal(embeddings.calls, callsAfterFirst);
  });

  it('marks the paper FAILED (never COMPLETED) when embedding fails, then recovers on retry', async () => {
    const input = newPdf();
    await assert.rejects(pipeline(new FailingEmbeddingService()).ingest(input));
    const failed = (await getPool().query(`SELECT id, processing_status AS s FROM papers WHERE file_hash = $1`, [sha256Hex(input.buffer)])).rows[0];
    assert.equal(failed.s, 'FAILED');
    const retry = await pipeline().ingest(input);
    assert.equal(retry.outcome, 'REPROCESSED');
    assert.equal(retry.paperId, failed.id);
    assert.equal((await status(retry.paperId)).s, 'COMPLETED');
    const orphans = (await getPool().query(`SELECT count(*) AS n FROM paper_chunks c LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id WHERE c.paper_id = $1 AND e.chunk_id IS NULL`, [retry.paperId])).rows[0];
    assert.equal(Number(orphans.n), 0);
  });

  it('creates no paper row when text extraction fails or yields no text', async () => {
    const bad = newPdf();
    await assert.rejects(pipeline(undefined, async () => { throw new AppError('PDF_PROCESSING_ERROR', 'unreadable'); }).ingest(bad), { code: 'PDF_PROCESSING_ERROR' });
    const empty = newPdf();
    await assert.rejects(pipeline(undefined, async () => ['', '  ']).ingest(empty), { code: 'PDF_PROCESSING_ERROR' });
    const rows = await getPool().query(`SELECT 1 FROM papers WHERE file_hash = ANY($1)`, [[sha256Hex(bad.buffer), sha256Hex(empty.buffer)]]);
    assert.equal(rows.rowCount, 0);
  });

  it('rolls back the whole metadata transaction on a constraint violation', async () => {
    const first = newPdf();
    const doi = `10.5555/${randomUUID().slice(0, 8)}`;
    await pipeline().ingest({ ...first, metadata: { ...first.metadata, doi } });
    const second = newPdf();
    await assert.rejects(pipeline().ingest({ ...second, metadata: { ...second.metadata, doi, authors: ['Rolled Back Author'] } }), { code: 'DUPLICATE_RESOURCE' });
    assert.equal((await getPool().query(`SELECT 1 FROM authors WHERE normalized_name = 'rolled back author'`)).rowCount, 0);
  });
});
