import { EMBEDDING_DIMENSION } from '../../lib/limits';
import type { EmbeddingService } from '../../lib/vector/embeddings';
import { basisVector } from './db';

/** Test double: maps known texts to chosen basis vectors so similarity is exactly predictable. */
export class FakeEmbeddingService implements EmbeddingService {
  readonly dimension = EMBEDDING_DIMENSION;
  calls = 0;
  constructor(readonly model = 'test-model', private readonly byText: Record<string, number> = {}, private readonly fallback = 767) {}

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0] as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.calls++;
    return texts.map((t) => basisVector(this.byText[t] ?? this.fallback));
  }
}

export class FailingEmbeddingService extends FakeEmbeddingService {
  override async embedBatch(): Promise<number[][]> {
    this.calls++;
    throw Object.assign(new Error('provider down'), { name: 'AppError' });
  }
}
