import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_UPLOAD_BYTES } from '../../lib/limits';
import { validatePdfUpload } from '../../lib/research/upload';

const pdf = Buffer.from('%PDF-1.7\nbody');
const ok = { fileName: 'paper.pdf', mimeType: 'application/pdf' };

describe('validatePdfUpload', () => {
  it('accepts a valid PDF', () => assert.doesNotThrow(() => validatePdfUpload(pdf, ok)));

  it('rejects a wrong MIME type', () => {
    assert.throws(() => validatePdfUpload(pdf, { ...ok, mimeType: 'text/plain' }), { code: 'VALIDATION_ERROR' });
  });

  it('rejects a wrong extension and path traversal in the file name', () => {
    assert.throws(() => validatePdfUpload(pdf, { ...ok, fileName: 'paper.exe' }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => validatePdfUpload(pdf, { ...ok, fileName: '../../etc/passwd.pdf' }), { code: 'VALIDATION_ERROR' });
  });

  it('rejects an empty file', () => {
    assert.throws(() => validatePdfUpload(Buffer.alloc(0), ok), { code: 'VALIDATION_ERROR' });
  });

  it('rejects an oversized file', () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    big.write('%PDF-');
    assert.throws(() => validatePdfUpload(big, ok), { code: 'VALIDATION_ERROR' });
  });

  it('rejects content that is not a PDF even if named .pdf', () => {
    assert.throws(() => validatePdfUpload(Buffer.from('MZ binary'), ok), { code: 'PDF_PROCESSING_ERROR' });
  });
});
