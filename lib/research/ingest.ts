import type { Pool as PgPool } from 'pg';
import { getConfig } from '../config';
import { run } from '../db/client';
import { insertPaperWithRelations, replaceChunks, resetPaperForReprocessing } from '../db/transactions/paperTransaction';
import { withTransaction } from '../db/transactions/withTransaction';
import { AppError } from '../errors';
import { errorFields, logger } from '../logger';
import { PROCESSING_STALE_MINUTES } from '../limits';
import type { IngestResult } from '../types';
import type { EmbeddingService } from '../vector/embeddings';
import { embedChunks, markPaperCompleted, markPaperFailed } from '../vector/lifecycle';
import { paperMetadataSchema, parseInput, type PaperMetadataInput } from '../validation/schemas';
import { chunkPages, type ChunkOptions } from './chunking';
import { cleanPages } from './cleaning';
import { detectMetadata } from './metadata';
import { extractPdfPages, type PageExtractor } from './pdf';
import { sha256Hex, validatePdfUpload } from './upload';

export interface IngestInput {
  buffer: Uint8Array;
  fileName: string;
  mimeType: string;
  uploadedBy?: string;
  /** Overrides detected metadata (authors and categories can only come from here). */
  metadata?: Partial<PaperMetadataInput>;
}

export interface IngestDeps {
  db: PgPool;
  embeddings: EmbeddingService;
  extractPages?: PageExtractor;
  chunkOptions?: ChunkOptions;
}

/**
 * PDF -> validated -> text -> cleaned -> chunks -> [txn: paper + relations + chunks]
 *     -> embeddings (no transaction held) -> COMPLETED.
 * A paper is only COMPLETED after every chunk has a stored embedding.
 */
export class IngestionPipeline {
  constructor(private readonly deps: IngestDeps) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const started = Date.now();
    const { db, embeddings } = this.deps;
    logger.info('ingest.start', { bytes: input.buffer.byteLength });

    validatePdfUpload(input.buffer, { fileName: input.fileName, mimeType: input.mimeType });
    const fileHash = sha256Hex(input.buffer);

    const [existing] = await run<{ id: string; processing_status: string; recent: boolean }>(
      db,
      `SELECT id, processing_status,
              updated_at > now() - make_interval(mins => $2) AS recent
       FROM papers WHERE file_hash = $1`,
      [fileHash, PROCESSING_STALE_MINUTES],
    );
    if (existing?.processing_status === 'COMPLETED') {
      const [count] = await run<{ n: string }>(db, `SELECT count(*) AS n FROM paper_chunks WHERE paper_id = $1`, [existing.id]);
      logger.info('ingest.duplicate', { ms: Date.now() - started });
      return { paperId: existing.id, outcome: 'DUPLICATE', chunkCount: Number(count?.n ?? 0) };
    }
    if (existing?.processing_status === 'PROCESSING' && existing.recent) {
      throw new AppError('DUPLICATE_RESOURCE', 'This paper is already being processed');
    }

    const extract = this.deps.extractPages ?? extractPdfPages;
    const pages = cleanPages(await extract(input.buffer));
    const config = getConfig();
    const chunks = chunkPages(pages, this.deps.chunkOptions ?? { chunkSize: config.CHUNK_SIZE_CHARS, overlap: config.CHUNK_OVERLAP_CHARS });
    if (chunks.length === 0) throw new AppError('PDF_PROCESSING_ERROR', 'No usable text could be extracted from the PDF');

    const detected = detectMetadata(pages, input.fileName);
    const metadata = parseInput(paperMetadataSchema, { ...detected, ...input.metadata });

    const { paperId, stored } = await withTransaction(async (tx) => {
      const id = existing
        ? (await resetPaperForReprocessing(tx, existing.id), existing.id)
        : await insertPaperWithRelations(tx, { ...metadata, fileHash, uploadedBy: input.uploadedBy });
      return { paperId: id, stored: await replaceChunks(tx, id, chunks) };
    }, db);

    try {
      await embedChunks(db, embeddings, stored);
      await markPaperCompleted(db, paperId);
    } catch (err) {
      logger.error('ingest.failed', { ...errorFields(err), ms: Date.now() - started });
      await markPaperFailed(db, paperId, err);
      throw err;
    }
    logger.info('ingest.completed', { chunks: stored.length, ms: Date.now() - started });
    return { paperId, outcome: existing ? 'REPROCESSED' : 'INGESTED', chunkCount: stored.length };
  }
}
