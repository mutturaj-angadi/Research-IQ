import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, getPool } from '../lib/db/client';
import { toErrorResponse } from '../lib/errors';
import { errorFields, logger } from '../lib/logger';
import { IngestionPipeline } from '../lib/research/ingest';
import { createEmbeddingService } from '../lib/vector/embeddings';

/** Usage: npm run ingest -- <directory-of-pdfs>. Metadata is auto-detected; one failing file does not stop the rest. */
async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error('Usage: npm run ingest -- <directory-of-pdfs>');
  const pipeline = new IngestionPipeline({ db: getPool(), embeddings: createEmbeddingService() });
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  let failed = 0;
  for (const file of files) {
    try {
      const result = await pipeline.ingest({ buffer: await readFile(path.join(dir, file)), fileName: file, mimeType: 'application/pdf' });
      logger.info('ingest.file', { file, outcome: result.outcome, chunks: result.chunkCount });
    } catch (err) {
      failed++;
      logger.error('ingest.file_failed', { file, code: toErrorResponse(err).body.error.code, ...errorFields(err) });
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    logger.error('ingest.script_failed', errorFields(err));
    process.exitCode = 1;
  })
  .finally(closePool);
