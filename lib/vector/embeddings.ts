import { getConfig } from '../config';
import { AppError } from '../errors';
import { EMBEDDING_DIMENSION } from '../limits';
import { assertDimension, l2Normalize } from './similarity';

/** Provider-neutral embedding contract. Everything else in the system depends only on this interface. */
export interface EmbeddingService {
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimension?: number;
  batchSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_INPUT_CHARS = 8000;

/** Works with OpenAI and any provider exposing the same `/embeddings` request/response shape. */
export class OpenAICompatibleEmbeddingService implements EmbeddingService {
  readonly model: string;
  readonly dimension: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.model = opts.model;
    this.dimension = opts.dimension ?? EMBEDDING_DIMENSION;
    this.batchSize = opts.batchSize ?? 32;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw new AppError('EMBEDDING_ERROR', 'Embedding provider returned no vector');
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    for (const t of texts) {
      if (typeof t !== 'string' || t.trim() === '') throw new AppError('EMBEDDING_ERROR', 'Cannot embed empty text');
    }
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const slice = texts.slice(i, i + this.batchSize).map((t) => t.slice(0, MAX_INPUT_CHARS));
      out.push(...(await this.requestWithRetry(slice)));
    }
    return out;
  }

  private async requestWithRetry(inputs: string[]): Promise<number[][]> {
    let lastError: AppError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.request(inputs);
      } catch (err) {
        if (!(err instanceof AppError) || !isRetryable(err)) throw err;
        lastError = err;
        await this.sleep(500 * 2 ** attempt);
      }
    }
    throw lastError ?? new AppError('EMBEDDING_ERROR', 'Embedding request failed');
  }

  private async request(inputs: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({ model: this.model, input: inputs, dimensions: this.dimension, encoding_format: 'float' }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new AppError('EMBEDDING_ERROR', 'Embedding provider is unreachable', { retryable: true }, { cause: err });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AppError('EMBEDDING_ERROR', 'Embedding provider rejected the credentials');
    }
    if (response.status === 429 || response.status >= 500) {
      throw new AppError('EMBEDDING_ERROR', 'Embedding provider is temporarily unavailable', { retryable: true });
    }
    if (!response.ok) throw new AppError('EMBEDDING_ERROR', 'Embedding provider rejected the request');

    const body = (await response.json().catch(() => null)) as { data?: { index: number; embedding: number[] }[] } | null;
    if (!body?.data || body.data.length !== inputs.length) {
      throw new AppError('EMBEDDING_ERROR', 'Embedding provider returned an unexpected response');
    }
    return [...body.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => {
        assertDimension(d.embedding, this.dimension);
        return l2Normalize(d.embedding);
      });
  }
}

function isRetryable(err: AppError): boolean {
  return typeof err.details === 'object' && err.details !== null && (err.details as { retryable?: boolean }).retryable === true;
}

export function createEmbeddingService(): EmbeddingService {
  const config = getConfig();
  if (!config.EMBEDDING_API_KEY) throw new AppError('EMBEDDING_ERROR', 'Embedding provider is not configured');
  return new OpenAICompatibleEmbeddingService({
    apiKey: config.EMBEDDING_API_KEY,
    baseUrl: config.EMBEDDING_BASE_URL,
    model: config.EMBEDDING_MODEL,
    batchSize: config.EMBEDDING_BATCH_SIZE,
  });
}
