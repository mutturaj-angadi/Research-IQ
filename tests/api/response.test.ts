import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSameOrigin, fail, ok, readJson } from '../../lib/api/response';
import { AppError } from '../../lib/errors';

describe('API envelope', () => {
  it('wraps success', async () => {
    const res = ok({ a: 1 }, 201);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { success: true, data: { a: 1 } });
  });

  it('maps AppError codes and statuses', async () => {
    const cases: [AppError, number, string][] = [
      [new AppError('UNAUTHORIZED', 'x'), 401, 'UNAUTHORIZED'], [new AppError('FORBIDDEN', 'x'), 403, 'FORBIDDEN'],
      [new AppError('NOT_FOUND', 'x'), 404, 'NOT_FOUND'], [new AppError('RATE_LIMITED', 'x'), 429, 'RATE_LIMITED'],
      [new AppError('DUPLICATE_RESOURCE', 'x'), 409, 'CONFLICT'], [new AppError('VALIDATION_ERROR', 'x', [{ path: 'q', message: 'bad' }]), 400, 'VALIDATION_ERROR'],
    ];
    for (const [err, status, code] of cases) {
      const res = fail(err);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(res.status, status);
      assert.equal(body.success, false);
      assert.equal(body.error.code, code);
    }
  });

  it('never leaks internals from unexpected errors', async () => {
    const res = fail(new Error('connection to postgres://user:secret@db/prod failed\n    at stack'));
    const text = JSON.stringify(await res.json());
    assert.equal(res.status, 500);
    assert.ok(!text.includes('secret') && !text.includes('postgres') && !text.includes('at stack'));
    const db = fail(new AppError('DATABASE_ERROR', 'A database error occurred', undefined, { cause: new Error('SELECT * FROM users') }));
    assert.ok(!JSON.stringify(await db.json()).includes('SELECT'));
  });
});

describe('request guards', () => {
  it('rejects malformed and oversized JSON', async () => {
    await assert.rejects(readJson(new Request('http://x', { method: 'POST', body: '{bad' })), { code: 'VALIDATION_ERROR' });
    await assert.rejects(readJson(new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 'x'.repeat(70_000) }) })), { code: 'VALIDATION_ERROR' });
    assert.deepEqual(await readJson(new Request('http://x', { method: 'POST', body: '{"a":1}' })), { a: 1 });
  });

  it('blocks cross-origin state-changing requests', () => {
    const req = (method: string, origin?: string) => new Request('http://app.test/api/x', { method, headers: { host: 'app.test', ...(origin && { origin }) } });
    assert.throws(() => assertSameOrigin(req('POST', 'http://evil.test')), { code: 'FORBIDDEN' });
    assert.doesNotThrow(() => assertSameOrigin(req('POST', 'http://app.test')));
    assert.doesNotThrow(() => assertSameOrigin(req('POST')));
    assert.doesNotThrow(() => assertSameOrigin(req('GET', 'http://evil.test')));
  });
});
