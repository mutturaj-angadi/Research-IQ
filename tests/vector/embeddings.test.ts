import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OpenAICompatibleEmbeddingService } from '../../lib/vector/embeddings';
import { assertDimension, l2Normalize, toVectorLiteral } from '../../lib/vector/similarity';

const DIM = 4;
const make = (fetchImpl: typeof fetch, extra = {}) =>
  new OpenAICompatibleEmbeddingService({
    apiKey: 'test-key', baseUrl: 'https://example.invalid/v1', model: 'm', dimension: DIM, batchSize: 2,
    sleep: async () => undefined, fetchImpl, ...extra,
  });

const okBody = (n: number, vec = [3, 0, 4, 0]) =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: vec })) }), { status: 200 });

describe('OpenAICompatibleEmbeddingService', () => {
  it('normalises vectors and batches requests', async () => {
    let requests = 0;
    const svc = make((async (_u: unknown, init?: RequestInit) => {
      requests++;
      return okBody(JSON.parse(String(init?.body)).input.length);
    }) as typeof fetch);
    const out = await svc.embedBatch(['a', 'b', 'c']);
    assert.equal(requests, 2);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], [0.6, 0, 0.8, 0]);
  });

  it('retries transient failures then succeeds', async () => {
    let n = 0;
    const svc = make((async () => (++n < 3 ? new Response('', { status: 429 }) : okBody(1))) as typeof fetch);
    assert.equal((await svc.embed('x')).length, DIM);
    assert.equal(n, 3);
  });

  it('does not retry rejected credentials and never leaks the key', async () => {
    let n = 0;
    const svc = make((async () => (n++, new Response('bad key test-key', { status: 401 }))) as typeof fetch);
    await assert.rejects(svc.embed('x'), (e: Error & { code?: string }) => e.code === 'EMBEDDING_ERROR' && !e.message.includes('test-key'));
    assert.equal(n, 1);
  });

  it('gives up after max retries with EMBEDDING_ERROR', async () => {
    const svc = make((async () => new Response('', { status: 503 })) as typeof fetch, { maxRetries: 1 });
    await assert.rejects(svc.embed('x'), { code: 'EMBEDDING_ERROR' });
  });

  it('rejects wrong dimensions and empty input', async () => {
    const svc = make((async () => okBody(1, [1, 2, 3])) as typeof fetch);
    await assert.rejects(svc.embed('x'), { code: 'EMBEDDING_ERROR' });
    await assert.rejects(svc.embedBatch(['  ']), { code: 'EMBEDDING_ERROR' });
  });

  it('rejects a response with the wrong number of vectors', async () => {
    const svc = make((async () => okBody(1)) as typeof fetch);
    await assert.rejects(svc.embedBatch(['a', 'b']), { code: 'EMBEDDING_ERROR' });
  });
});

describe('similarity helpers', () => {
  it('validates dimension and finiteness', () => {
    assert.throws(() => assertDimension([1, 2], 3), { code: 'EMBEDDING_ERROR' });
    assert.throws(() => assertDimension([1, Number.NaN, 3], 3), { code: 'EMBEDDING_ERROR' });
    assert.throws(() => l2Normalize([0, 0]), { code: 'EMBEDDING_ERROR' });
  });
  it('formats pgvector literals', () => assert.equal(toVectorLiteral([1, 0.5]), '[1,0.5]'));
});
