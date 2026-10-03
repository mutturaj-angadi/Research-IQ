import { createHash } from 'node:crypto';
import { AppError } from '../errors';
import { MAX_UPLOAD_BYTES } from '../limits';
import { parseInput, uploadMetaSchema } from '../validation/schemas';

export interface UploadMeta {
  fileName: string;
  mimeType: string;
}

/** Rejects anything that is not a plausible, size-limited PDF before any parsing happens. */
export function validatePdfUpload(buffer: Uint8Array, meta: UploadMeta): void {
  if (buffer.byteLength === 0) throw new AppError('VALIDATION_ERROR', 'The uploaded file is empty');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError('VALIDATION_ERROR', `The file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB upload limit`);
  }
  parseInput(uploadMetaSchema, { fileName: meta.fileName, mimeType: meta.mimeType, size: buffer.byteLength });
  const magic = Buffer.from(buffer.subarray(0, 5)).toString('latin1');
  if (magic !== '%PDF-') throw new AppError('PDF_PROCESSING_ERROR', 'The file is not a valid PDF');
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}
