import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError, fromDbError, toErrorResponse } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { requireRole, requireUser } from '../../lib/security/authz';
import { FixedWindowRateLimiter } from '../../lib/security/rateLimit';
import { buildPaperFilterClause } from '../../lib/vector/filters';
import { filtersSchema, parseInput, uuidSchema } from '../../lib/validation/schemas';

const INJECTIONS = ["'; DROP TABLE papers; --", "' OR '1'='1", '1; SELECT pg_sleep(10)', '../../etc/passwd'];

describe('input validation blocks injection payloads', () => {
  it('rejects them as IDs and filter values', () => {
    for (const payload of INJECTIONS) {
      assert.throws(() => parseInput(uuidSchema, payload), { code: 'VALIDATION_ERROR' });
      assert.throws(() => parseInput(filtersSchema, { authorId: payload }), { code: 'VALIDATION_ERROR' });
      assert.throws(() => parseInput(filtersSchema, { paperIds: [payload] }), { code: 'VALIDATION_ERROR' });
    }
  });

  it('keeps free-text filter values out of the SQL text', () => {
    for (const payload of INJECTIONS) {
      const { sql, params } = buildPaperFilterClause({ venue: payload }, 1);
      assert.ok(!sql.includes(payload));
      assert.deepEqual(params, [payload]);
    }
  });
});

describe('error responses', () => {
  it('never expose database internals', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "papers_doi_key" at postgres://u:pw@host/db'), { code: '23505' });
    const res = toErrorResponse(fromDbError(pgError));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_RESOURCE');
    assert.ok(!JSON.stringify(res).includes('papers_doi_key'));
    assert.ok(!JSON.stringify(res).includes('postgres://'));
  });

  it('hide unknown errors behind a generic message', () => {
    const res = toErrorResponse(new Error('secret stack detail'));
    assert.equal(res.status, 500);
    assert.equal(res.body.error.message, 'An unexpected error occurred');
  });

  it('map unknown database failures to DATABASE_ERROR without the cause', () => {
    const res = toErrorResponse(fromDbError(Object.assign(new Error('connection to 10.0.0.5 refused'), { code: 'ECONNREFUSED' })));
    assert.equal(res.body.error.code, 'DATABASE_ERROR');
    assert.ok(!JSON.stringify(res).includes('10.0.0.5'));
  });
});

describe('authorization and rate limiting', () => {
  it('requires authentication and the ADMIN role where needed', () => {
    assert.throws(() => requireUser(undefined), { code: 'UNAUTHORIZED' });
    assert.throws(() => requireRole({ userId: 'u', roles: ['RESEARCHER'] }, 'ADMIN'), { code: 'FORBIDDEN' });
    assert.doesNotThrow(() => requireRole({ userId: 'u', roles: ['ADMIN'] }, 'ADMIN'));
  });

  it('limits requests per key per window', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 1000, () => now);
    limiter.check('a');
    limiter.check('a');
    assert.throws(() => limiter.check('a'), (e) => e instanceof AppError && e.code === 'RATE_LIMITED');
    assert.doesNotThrow(() => limiter.check('b'));
    now = 1000;
    assert.doesNotThrow(() => limiter.check('a'));
  });
});

describe('logger', () => {
  it('drops secret-looking fields', () => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: string) => (chunks.push(String(c)), true)) as typeof process.stdout.write;
    try {
      logger.info('test.event', { apiKey: 'sk-secret', databaseUrl: 'postgres://x', password: 'p', ok: 'yes' });
    } finally {
      process.stdout.write = original;
    }
    const line = chunks.join('');
    assert.ok(line.includes('"ok":"yes"'));
    assert.ok(!line.includes('sk-secret') && !line.includes('postgres://') && !line.includes('"password"'));
  });
});
