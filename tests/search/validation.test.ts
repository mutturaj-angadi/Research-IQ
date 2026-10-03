import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_TOP_K, MAX_PAGE_SIZE, MAX_QUERY_LENGTH, MAX_TOP_K } from '../../lib/limits';
import { askSchema, keywordSearchSchema, parseInput, semanticSearchSchema } from '../../lib/validation/schemas';

describe('semantic search validation', () => {
  it('applies defaults', () => {
    const v = parseInput(semanticSearchSchema, { query: ' dense retrieval ' });
    assert.equal(v.query, 'dense retrieval');
    assert.equal(v.topK, DEFAULT_TOP_K);
    assert.deepEqual(v.filters, {});
  });

  it('rejects topK outside 1..MAX_TOP_K', () => {
    for (const topK of [0, -1, MAX_TOP_K + 1, 1.5, '5']) {
      assert.throws(() => parseInput(semanticSearchSchema, { query: 'x', topK }), { code: 'VALIDATION_ERROR' });
    }
  });

  it('rejects empty and oversized queries', () => {
    assert.throws(() => parseInput(semanticSearchSchema, { query: '   ' }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => parseInput(semanticSearchSchema, { query: 'a'.repeat(MAX_QUERY_LENGTH + 1) }), { code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid filters', () => {
    const bad = [
      { yearFrom: 2022, yearTo: 2018 },
      { yearFrom: 1200 },
      { authorId: 'not-a-uuid' },
      { paperIds: ['1; DROP TABLE papers'] },
      { categoryIds: [-3] },
      { unknownFilter: true },
    ];
    for (const filters of bad) {
      assert.throws(() => parseInput(semanticSearchSchema, { query: 'x', filters }), { code: 'VALIDATION_ERROR' });
    }
  });
});

describe('pagination and questions', () => {
  it('caps page size and rejects page < 1', () => {
    assert.throws(() => parseInput(keywordSearchSchema, { query: 'x', pageSize: MAX_PAGE_SIZE + 1 }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => parseInput(keywordSearchSchema, { query: 'x', page: 0 }), { code: 'VALIDATION_ERROR' });
    assert.equal(parseInput(keywordSearchSchema, { query: 'x', page: '2', pageSize: '10' }).page, 2);
  });

  it('requires a meaningful question', () => {
    assert.throws(() => parseInput(askSchema, { question: 'hi' }), { code: 'VALIDATION_ERROR' });
    assert.equal(parseInput(askSchema, { question: 'What is dense retrieval?' }).topK, 5);
  });
});
