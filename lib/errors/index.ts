export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_RESOURCE'
  | 'DATABASE_ERROR'
  | 'EMBEDDING_ERROR'
  | 'VECTOR_SEARCH_ERROR'
  | 'PDF_PROCESSING_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  DUPLICATE_RESOURCE: 409,
  DATABASE_ERROR: 500,
  EMBEDDING_ERROR: 502,
  VECTOR_SEARCH_ERROR: 500,
  PDF_PROCESSING_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Application error. `message` is always safe to show to a user; `cause` never leaves the server. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = HTTP_STATUS[code];
  }
}

export interface ErrorResponse {
  status: number;
  body: { error: { code: ErrorCode; message: string; details?: unknown } };
}

export function getPgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Maps a PostgreSQL driver error to an AppError without leaking SQL text or constraint internals. */
export function fromDbError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  switch (getPgCode(err)) {
    case '23505':
      return new AppError('DUPLICATE_RESOURCE', 'A record with these values already exists', undefined, { cause: err });
    case '23503':
      return new AppError('VALIDATION_ERROR', 'A referenced record does not exist', undefined, { cause: err });
    case '23502':
    case '23514':
    case '22P02':
    case '22001':
    case '22003':
      return new AppError('VALIDATION_ERROR', 'A value violates a data integrity rule', undefined, { cause: err });
    default:
      return new AppError('DATABASE_ERROR', 'A database error occurred', undefined, { cause: err });
  }
}

/** Converts any thrown value into a response body that is safe for production. Stack traces are never included. */
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof AppError) {
    const error: ErrorResponse['body']['error'] = { code: err.code, message: err.message };
    if (err.code === 'VALIDATION_ERROR' && err.details !== undefined) error.details = err.details;
    return { status: err.status, body: { error } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } } };
}
