import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { HAS_DB, basisLiteral, closePool, getPool, inRollback, insertChunk, insertEmbedding, insertPaper, sqlState } from '../helpers/db';

const UNIQUE = '23505', CHECK = '23514', FK = '23503';

describe('database constraints, triggers, views and functions', { skip: !HAS_DB }, () => {
  after(closePool);

  it('enforces paper integrity rules', () =>
    inRollback(async (c) => {
      await insertPaper(c, { doi: '10.1000/dup' });
      assert.equal(await sqlState(c, `INSERT INTO papers (title, doi) VALUES ('Other', '10.1000/dup')`), UNIQUE);
      assert.equal(await sqlState(c, `INSERT INTO papers (title, publication_year) VALUES ('Old', 1850)`), CHECK);
      assert.equal(await sqlState(c, `INSERT INTO papers (title) VALUES ('   ')`), CHECK);
      assert.equal(await sqlState(c, `INSERT INTO papers (title, doi) VALUES ('Bad DOI', 'not-a-doi')`), CHECK);
      assert.equal(await sqlState(c, `INSERT INTO papers (title, processing_status) VALUES ('Bad status', 'DONE')`), CHECK);
      assert.equal(await sqlState(c, `INSERT INTO papers (title, processing_error) VALUES ('Error without failure', 'boom')`), CHECK);
      assert.equal(await sqlState(c, `INSERT INTO papers (title, citation_count) VALUES ('Negative', -1)`), CHECK);
    }));

  it('enforces foreign keys and junction uniqueness', () =>
    inRollback(async (c) => {
      const paper = await insertPaper(c);
      const author = (await c.query<{ id: string }>(`INSERT INTO authors (full_name) VALUES ('Ada Lovelace') RETURNING id`)).rows[0]!.id;
      const author2 = (await c.query<{ id: string }>(`INSERT INTO authors (full_name) VALUES ('Alan Turing') RETURNING id`)).rows[0]!.id;
      await c.query(`INSERT INTO paper_authors VALUES ($1, $2, 1)`, [paper, author]);
      assert.equal(await sqlState(c, `INSERT INTO paper_authors VALUES ($1, $2, 2)`, [paper, author]), UNIQUE);
      assert.equal(await sqlState(c, `INSERT INTO paper_authors VALUES ($1, $2, 1)`, [paper, author2]), UNIQUE);
      assert.equal(await sqlState(c, `INSERT INTO paper_authors VALUES ('00000000-0000-0000-0000-000000000000', $1, 1)`, [author]), FK);
      assert.equal(await sqlState(c, `INSERT INTO paper_authors VALUES ($1, $2, 0)`, [paper, author2]), CHECK);
    }));

  it('normalises author names with a trigger', () =>
    inRollback(async (c) => {
      await c.query(`INSERT INTO authors (full_name) VALUES ('  Ada    LOVELACE ')`);
      assert.equal(await sqlState(c, `INSERT INTO authors (full_name) VALUES ('ada lovelace')`), UNIQUE);
      const row = (await c.query(`SELECT full_name, normalized_name FROM authors WHERE normalized_name = 'ada lovelace'`)).rows[0];
      assert.equal(row.full_name, 'Ada LOVELACE');
    }));

  it('prevents duplicate saved papers, chunk indexes and evidence rows', () =>
    inRollback(async (c) => {
      const paper = await insertPaper(c);
      const user = (await c.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name) VALUES ('t@example.com', $1, 'T') RETURNING id`, ['x'.repeat(30)])).rows[0]!.id;
      await c.query(`INSERT INTO saved_papers (user_id, paper_id) VALUES ($1, $2)`, [user, paper]);
      assert.equal(await sqlState(c, `INSERT INTO saved_papers (user_id, paper_id) VALUES ($1, $2)`, [user, paper]), UNIQUE);
      const chunk = await insertChunk(c, paper, 0);
      assert.equal(await sqlState(c, `INSERT INTO paper_chunks (paper_id, chunk_index, content, content_hash) VALUES ($1, 0, 'y', $2)`, [paper, 'a'.repeat(64)]), UNIQUE);
      const q = (await c.query<{ id: string }>(`INSERT INTO questions (user_id, question_text) VALUES ($1, 'why?') RETURNING id`, [user])).rows[0]!.id;
      const a = (await c.query<{ id: string }>(`INSERT INTO answers (question_id, answer_text, status) VALUES ($1, 'because', 'ANSWERED') RETURNING id`, [q])).rows[0]!.id;
      await c.query(`INSERT INTO answer_evidence VALUES ($1, $2, 1, 0.9)`, [a, chunk]);
      assert.equal(await sqlState(c, `INSERT INTO answer_evidence VALUES ($1, $2, 2, 0.8)`, [a, chunk]), UNIQUE);
      assert.equal(await sqlState(c, `INSERT INTO answers (question_id, answer_text, status) VALUES ($1, 'second', 'ANSWERED')`, [q]), UNIQUE);
    }));

  it('rejects embeddings with the wrong dimension and accepts the right one', () =>
    inRollback(async (c) => {
      const chunk = await insertChunk(c, await insertPaper(c), 0);
      assert.ok(await sqlState(c, `INSERT INTO chunk_embeddings (chunk_id, embedding, model, dimension, content_hash) VALUES ($1, '[1,2,3]'::vector, 'm', 768, $2)`, [chunk, 'a'.repeat(64)]));
      assert.equal(await sqlState(c, `INSERT INTO chunk_embeddings (chunk_id, embedding, model, dimension, content_hash) VALUES ($1, $2::vector, 'm', 768, $3)`, [chunk, basisLiteral(0), 'a'.repeat(64)]), undefined);
    }));

  it('only allows COMPLETED when every chunk is embedded', () =>
    inRollback(async (c) => {
      const paper = await insertPaper(c);
      const complete = `UPDATE papers SET processing_status = 'COMPLETED' WHERE id = $1`;
      assert.equal(await sqlState(c, complete, [paper]), CHECK); // no chunks
      const chunk = await insertChunk(c, paper, 0);
      assert.equal(await sqlState(c, complete, [paper]), CHECK); // chunk without embedding
      await insertEmbedding(c, chunk, 0);
      assert.equal(await sqlState(c, complete, [paper]), undefined);
    }));

  it('cascades paper deletion to chunks and embeddings', () =>
    inRollback(async (c) => {
      const paper = await insertPaper(c);
      const chunk = await insertChunk(c, paper, 0);
      await insertEmbedding(c, chunk, 0);
      await c.query(`DELETE FROM papers WHERE id = $1`, [paper]);
      assert.equal((await c.query(`SELECT 1 FROM paper_chunks WHERE id = $1`, [chunk])).rowCount, 0);
      assert.equal((await c.query(`SELECT 1 FROM chunk_embeddings WHERE chunk_id = $1`, [chunk])).rowCount, 0);
    }));

  it('exposes counts through paper_summary_view and get_paper_statistics', () =>
    inRollback(async (c) => {
      const paper = await insertPaper(c, { title: 'View test' });
      const a = (await c.query<{ id: string }>(`INSERT INTO authors (full_name) VALUES ('First Author') RETURNING id`)).rows[0]!.id;
      await c.query(`INSERT INTO paper_authors VALUES ($1, $2, 1)`, [paper, a]);
      const chunk = await insertChunk(c, paper, 0);
      await insertChunk(c, paper, 1);
      await insertEmbedding(c, chunk, 0);
      const v = (await c.query(`SELECT authors, author_count, chunk_count FROM paper_summary_view WHERE id = $1`, [paper])).rows[0];
      assert.equal(v.authors, 'First Author');
      assert.equal(Number(v.chunk_count), 2);
      const s = (await c.query(`SELECT * FROM get_paper_statistics($1)`, [paper])).rows[0];
      assert.equal(Number(s.chunk_count), 2);
      assert.equal(Number(s.embedded_chunk_count), 1);
    }));

  it('supports weighted full-text search over title and abstract', () =>
    inRollback(async (c) => {
      await c.query(`INSERT INTO papers (title, abstract) VALUES ('Dense passage retrieval', 'Open-domain question answering.')`);
      const r = await c.query(`SELECT 1 FROM papers WHERE search_vector @@ websearch_to_tsquery('english', 'retrieving passages')`);
      assert.equal(r.rowCount, 1);
    }));

  it('refreshes updated_at on update (committed row)', async () => {
    const pool = getPool();
    const id = (await pool.query<{ id: string }>(`INSERT INTO papers (title) VALUES ('Trigger test') RETURNING id`)).rows[0]!.id;
    try {
      const before = (await pool.query(`SELECT updated_at FROM papers WHERE id = $1`, [id])).rows[0].updated_at as Date;
      await new Promise((r) => setTimeout(r, 20));
      await pool.query(`UPDATE papers SET title = 'Trigger test 2' WHERE id = $1`, [id]);
      const after = (await pool.query(`SELECT updated_at FROM papers WHERE id = $1`, [id])).rows[0].updated_at as Date;
      assert.ok(after.getTime() > before.getTime());
    } finally {
      await pool.query(`DELETE FROM papers WHERE id = $1`, [id]);
    }
  });
});
