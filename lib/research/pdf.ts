import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../errors';
import { errorFields, logger } from '../logger';

export type PageExtractor = (pdf: Uint8Array) => Promise<string[]>;

/** Extracts text per page (index 0 = page 1). Fails with PDF_PROCESSING_ERROR for unreadable or text-less PDFs. */
export const extractPdfPages: PageExtractor = async (pdf) => {
  let pages: string[];
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: false });
    pages = text;
  } catch (err) {
    logger.warn('pdf.extract_failed', errorFields(err));
    throw new AppError('PDF_PROCESSING_ERROR', 'The PDF could not be read', undefined, { cause: err });
  }
  if (pages.every((p) => p.trim() === '')) {
    throw new AppError('PDF_PROCESSING_ERROR', 'The PDF contains no extractable text (it may be a scanned image)');
  }
  return pages;
};
