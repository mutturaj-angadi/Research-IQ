import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { searchPapersKeyword } from '../../lib/search/keyword';
import { listPapers } from '../../lib/db/queries/catalog';
import { HAS_DB, closePool, getPool } from '../helpers/db';

const PAYLOADS = ["'; DROP TABLE papers; --", `" OR 1=1 --`, "') UNION SELECT password_hash FROM users --", 'a & | ! ( ) :*'];

describe('SQL injection resistance (database)', { skip: !HAS_DB }, () => {
  after(closePool);

  it('treats keyword queries and venue filters strictly as data', async () => {
    for (const payload of PAYLOADS) {
      await assert.doesNotReject(searchPapersKeyword(getPool(), { query: payload }));
      await assert.doesNotReject(listPapers(getPool(), {}, { venue: payload }));
    }
    assert.equal((await getPool().query(`SELECT to_regclass('public.papers') AS t`)).rows[0].t, 'papers');
  });
});
