/** Fixed system limits. Changing EMBEDDING_DIMENSION requires a new migration (vector(768) column). */
export const EMBEDDING_DIMENSION = 768;

export const DEFAULT_TOP_K = 8;
export const MAX_TOP_K = 20;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const MAX_QUERY_LENGTH = 500;
export const MAX_QUESTION_LENGTH = 2000;
export const MAX_FILTER_PAPER_IDS = 50;
export const MAX_FILTER_CATEGORY_IDS = 20;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Cosine similarity below this value is treated as "not relevant" (override per request). */
export const DEFAULT_MIN_SIMILARITY = 0.25;
/** Maximum chunks returned from one paper, so one paper cannot crowd out the rest. */
export const DEFAULT_MAX_CHUNKS_PER_PAPER = 3;
/** A PROCESSING paper older than this is considered abandoned and may be reprocessed. */
export const PROCESSING_STALE_MINUTES = 15;
