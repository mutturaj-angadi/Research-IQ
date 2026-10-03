import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { askBodySchema, categoryBodySchema, loginSchema, paperListQuerySchema, registerSchema, semanticBodySchema, toFilters } from '../../lib/validation/app';
import { parseInput, uuidSchema } from '../../lib/validation/schemas';

const valid = { fullName: 'Ada Lovelace', email: '  Ada@Example.COM ', password: 'Strong-Pass-1', confirmPassword: 'Strong-Pass-1' };

describe('registration validation', () => {
  it('normalises the email and accepts a valid payload', () => {
    assert.equal(parseInput(registerSchema, valid).email, 'ada@example.com');
  });
  it('rejects invalid email, weak passwords, mismatch and empty name', () => {
    for (const bad of [
      { ...valid, email: 'not-an-email' }, { ...valid, password: 'short1A', confirmPassword: 'short1A' },
      { ...valid, password: 'alllowercase123', confirmPassword: 'alllowercase123' }, { ...valid, password: 'NoDigitsHere!!', confirmPassword: 'NoDigitsHere!!' },
      { ...valid, confirmPassword: 'Different-Pass-1' }, { ...valid, fullName: '   ' },
    ]) assert.throws(() => parseInput(registerSchema, bad), { code: 'VALIDATION_ERROR' });
  });
  it('requires both login fields', () => {
    assert.throws(() => parseInput(loginSchema, { email: 'a@b.co' }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => parseInput(loginSchema, 'nope'), { code: 'VALIDATION_ERROR' });
  });
});

describe('request validation', () => {
  it('bounds pagination', () => {
    assert.throws(() => parseInput(paperListQuerySchema, { page: '0' }));
    assert.throws(() => parseInput(paperListQuerySchema, { pageSize: '51' }));
    assert.throws(() => parseInput(paperListQuerySchema, { pageSize: '-1' }));
    assert.equal(parseInput(paperListQuerySchema, {}).pageSize, 20);
  });
  it('treats empty query-string filters as absent and builds Member 1 filters', () => {
    const q = parseInput(paperListQuerySchema, { yearFrom: '', venue: '', categoryId: '3' });
    assert.deepEqual(toFilters(q), { categoryIds: [3] });
  });
  it('rejects oversized queries and questions', () => {
    assert.throws(() => parseInput(semanticBodySchema, { query: 'x'.repeat(501) }));
    assert.throws(() => parseInput(askBodySchema, { question: 'x'.repeat(2001) }));
    assert.throws(() => parseInput(askBodySchema, { question: 'ab' }));
  });
  it('rejects SQL injection payloads as ids and unknown filter keys', () => {
    for (const p of ["'; DROP TABLE users; --", "1 OR 1=1", '../../etc/passwd']) assert.throws(() => parseInput(uuidSchema, p));
    assert.throws(() => parseInput(semanticBodySchema, { query: 'q', filters: { '1=1; --': 1 } }));
  });
  it('validates category names', () => {
    assert.throws(() => parseInput(categoryBodySchema, { name: '  ' }));
    assert.equal(parseInput(categoryBodySchema, { name: ' ML ' }).name, 'ML');
  });
});
