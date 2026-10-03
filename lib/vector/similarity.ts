import { EMBEDDING_DIMENSION } from '../limits';
import { AppError } from '../errors';

/**
 * Metric: cosine distance (pgvector `<=>`), index opclass vector_cosine_ops.
 * Similarity = 1 - distance. Vectors are L2-normalised before storage.
 */
export function distanceToSimilarity(distance: number): number {
  return 1 - distance;
}

export function assertDimension(vector: readonly number[], expected: number = EMBEDDING_DIMENSION): void {
  if (vector.length !== expected) {
    throw new AppError('EMBEDDING_ERROR', `Embedding has ${vector.length} dimensions, expected ${expected}`);
  }
  for (const x of vector) {
    if (!Number.isFinite(x)) throw new AppError('EMBEDDING_ERROR', 'Embedding contains a non-finite value');
  }
}

export function l2Normalize(vector: readonly number[]): number[] {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new AppError('EMBEDDING_ERROR', 'Embedding has zero length');
  return vector.map((x) => x / norm);
}

/** pgvector text input format; always passed as a bound parameter and cast with ::vector. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}
