import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { AnswerGenerator } from '../../lib/ai/answerGenerator';
import { EvidenceService, NO_EVIDENCE_ANSWER, extractCitedNumbers, hasInvalidCitations } from '../../lib/evidence/retrieval';
import { searchPapersKeyword } from '../../lib/search/keyword';
import { SemanticSearchService } from '../../lib/search/semantic';
import { FakeEmbeddingService } from '../helpers/fakes';
import { HAS_DB, closePool, getPool, insertChunk, insertEmbedding, insertPaper } from '../helpers/db';

const tag = randomUUID().slice(0, 8);
const embeddings = new FakeEmbeddingService('test-model', { alpha: 0, beta: 1 });
const ids = { paperA: '', paperB: '', chunkA: '', chunkB: '', chunkOld: '', user: '' };

describe('semantic search, keyword search and evidence', { skip: !HAS_DB }, () => {
  const pool = getPool;

  before(async () => {
    const c = await pool().connect();
    try {
      ids.paperA = await insertPaper(c, { title: `Alpha ${tag} neural retrieval`, year: 2019, venue: 'VenueA' });
      ids.paperB = await insertPaper(c, { title: `Beta ${tag} optimisation`, year: 2023, venue: 'VenueB' });
      ids.chunkA = await insertChunk(c, ids.paperA, 0, `alpha ${tag} passage about retrieval`, 4, 'Methods');
      ids.chunkB = await insertChunk(c, ids.paperB, 0, `beta ${tag} passage about optimisation`, 7, 'Results');
      ids.chunkOld = await insertChunk(c, ids.paperA, 1, `old model ${tag} chunk`, 5, 'Methods');
      await insertEmbedding(c, ids.chunkA, 0);
      await insertEmbedding(c, ids.chunkB, 1);
      await insertEmbedding(c, ids.chunkOld, 0, 'old-model');
      await c.query(`UPDATE papers SET processing_status = 'COMPLETED' WHERE id = ANY($1)`, [[ids.paperA, ids.paperB]]);
      ids.user = (await c.query<{ id: string }>(`INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, 'T') RETURNING id`, [`t-${tag}@example.com`, 'x'.repeat(30)])).rows[0]!.id;
    } finally {
      c.release();
    }
  });

  after(async () => {
    await pool().query(`DELETE FROM papers WHERE id = ANY($1)`, [[ids.paperA, ids.paperB]]);
    await pool().query(`DELETE FROM users WHERE id = $1`, [ids.user]);
    await closePool();
  });

  const search = () => new SemanticSearchService({ db: pool(), embeddings });

  it('returns the nearest chunk first with similarity 1 and ignores other models', async () => {
    const res = await search().search({ query: 'alpha', minSimilarity: -1, filters: { paperIds: [ids.paperA, ids.paperB] } });
    assert.equal(res.results[0]?.chunkId, ids.chunkA);
    assert.ok(Math.abs((res.results[0]?.similarity ?? 0) - 1) < 1e-6);
    assert.ok(!res.results.some((r) => r.chunkId === ids.chunkOld));
  });

  it('reports no evidence when nothing passes the similarity threshold', async () => {
    const res = await search().search({ query: 'unrelated topic', filters: { paperIds: [ids.paperA, ids.paperB] } });
    assert.equal(res.noEvidence, true);
    assert.deepEqual(res.results, []);
  });

  it('applies metadata filters in SQL', async () => {
    const res = await search().search({ query: 'alpha', minSimilarity: -1, filters: { paperIds: [ids.paperA, ids.paperB], yearFrom: 2022 } });
    assert.deepEqual(res.results.map((r) => r.paperId), [ids.paperB]);
  });

  it('returns real chunk metadata (no fabricated evidence)', async () => {
    const res = await search().search({ query: 'alpha', minSimilarity: -1, filters: { paperIds: [ids.paperA, ids.paperB] } });
    for (const r of res.results) {
      const row = (await pool().query(
        `SELECT c.page_number, c.section, c.paper_id, c.content, p.title FROM paper_chunks c JOIN papers p ON p.id = c.paper_id WHERE c.id = $1`, [r.chunkId])).rows[0];
      assert.ok(row, 'chunk exists');
      assert.equal(row.page_number, r.pageNumber);
      assert.equal(row.section, r.section);
      assert.equal(row.paper_id, r.paperId);
      assert.equal(row.title, r.paperTitle);
      assert.ok(row.content.startsWith(r.snippet));
    }
  });

  it('finds papers by keyword with ranking and filters', async () => {
    const page = await searchPapersKeyword(pool(), { query: `${tag} retrieval` });
    assert.ok(page.items.some((i) => i.paperId === ids.paperA));
    const filtered = await searchPapersKeyword(pool(), { query: tag, filters: { yearFrom: 2022 } });
    assert.deepEqual(filtered.items.map((i) => i.paperId), [ids.paperB]);
    assert.equal((await searchPapersKeyword(pool(), { query: 'zzzzqqqq nonexistent' })).total, 0);
  });

  it('answers only with citations that map to retrieved chunks', async () => {
    let calls = 0;
    const generator: AnswerGenerator = { model: 'stub', generate: async () => (calls++, 'Claim one [1].') };
    const svc = new EvidenceService({ db: pool(), search: search(), generator: () => generator });
    const res = await svc.askWithEvidence({ question: 'alpha', topK: 3, filters: { paperIds: [ids.paperA] } }, { userId: ids.user, roles: ['RESEARCHER'] });
    assert.equal(res.status, 'ANSWERED');
    assert.deepEqual(res.evidence.map((e) => e.chunkId), [ids.chunkA]);
    assert.equal((await svc.getAnswerEvidence(res.answerId, { userId: ids.user, roles: ['RESEARCHER'] })).length, 1);
    await assert.rejects(svc.getAnswerEvidence(res.answerId, { userId: randomUUID(), roles: ['RESEARCHER'] }), { code: 'FORBIDDEN' });
    assert.equal(calls, 1);
  });

  it('fails closed when the answer contains a citation not present in retrieved evidence', async () => {
    const generator: AnswerGenerator = { model: 'stub', generate: async () => 'Supported claim [1]. Fabricated source [99].' };
    const svc = new EvidenceService({ db: pool(), search: search(), generator: () => generator });
    const res = await svc.askWithEvidence({ question: 'alpha', topK: 3, filters: { paperIds: [ids.paperA] } }, { userId: ids.user, roles: ['RESEARCHER'] });
    assert.equal(res.status, 'NO_EVIDENCE');
    assert.equal(res.answer, NO_EVIDENCE_ANSWER);
    assert.deepEqual(res.evidence, []);
  });

  it('does not call the answer model when no evidence is retrieved', async () => {
    let calls = 0;
    const generator: AnswerGenerator = { model: 'stub', generate: async () => (calls++, 'unused [1]') };
    const svc = new EvidenceService({ db: pool(), search: search(), generator: () => generator });
    const res = await svc.askWithEvidence({ question: 'unrelated question', filters: { paperIds: [ids.paperA] } }, { userId: ids.user, roles: ['RESEARCHER'] });
    assert.equal(res.status, 'NO_EVIDENCE');
    assert.equal(res.answer, NO_EVIDENCE_ANSWER);
    assert.deepEqual(res.evidence, []);
    assert.equal(calls, 0);
  });
});

describe('extractCitedNumbers', () => {
  it('keeps only provided source numbers, in order, without duplicates', () => {
    assert.deepEqual(extractCitedNumbers('A [2] B [1][2] C [9] D [0]', 3), [2, 1]);
    assert.deepEqual(extractCitedNumbers('no citations here', 3), []);
  });

  it('detects citations that do not map to supplied sources', () => {
    assert.equal(hasInvalidCitations('Claim [1] and [2]', 2), false);
    assert.equal(hasInvalidCitations('Claim [1] and [99]', 2), true);
    assert.equal(hasInvalidCitations('Claim [0]', 2), true);
  });
});
