import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPaperFilterClause } from '../../lib/vector/filters';

const ID = '3f2b8c2e-5d41-4c0e-9a57-0a1b2c3d4e5f';

describe('buildPaperFilterClause', () => {
  it('returns nothing for empty filters', () => {
    assert.deepEqual(buildPaperFilterClause({}, 1), { sql: '', params: [] });
  });

  it('numbers placeholders from the given start and binds every value', () => {
    const f = buildPaperFilterClause({ yearFrom: 2018, yearTo: 2022, venue: 'NeurIPS', paperIds: [ID], categoryIds: [1, 2], authorId: ID }, 5);
    assert.deepEqual(f.params, [2018, 2022, 'NeurIPS', [ID], [1, 2], ID]);
    assert.ok(f.sql.includes('$5') && f.sql.includes('$10'));
    assert.ok(!f.sql.includes('NeurIPS') && !f.sql.includes(ID));
  });
});
