// Runs only with TEST_DATABASE_URL pointing at a migrated, disposable database (same convention as Member 1).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { HAS_DB, closePool, getPool, insertPaper } from '../helpers/db';
import { createCategory, deleteCategory, getAnalytics, getDashboard, getQuestion, listHistoryByKind, listSavedPapers, unsavePaper } from '../../lib/services/library';
import { authenticateUser, listUsers, registerUser } from '../../lib/services/users';
import { savePaperForUser } from '../../lib/db/queries/catalog';

const PASSWORD = 'Test-Password-1';
const uniqueEmail = () => `t-${randomUUID()}@example.test`;
const creds = (email: string) => ({ fullName: 'Test User', email, password: PASSWORD, confirmPassword: PASSWORD });
const created: string[] = [];

async function newUser(role: 'RESEARCHER' | 'ADMIN' = 'RESEARCHER') {
  const email = uniqueEmail();
  const { id } = await registerUser(creds(email), role);
  created.push(id);
  return { id, email };
}

after(async () => {
  if (HAS_DB) await getPool().query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [created]);
  await closePool();
});

describe('authentication (database)', { skip: !HAS_DB }, () => {
  it('registers, stores only a hash, and authenticates', async () => {
    const { id, email } = await newUser();
    const { rows } = await getPool().query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [id]);
    assert.ok(rows[0]?.password_hash.startsWith('scrypt$'));
    assert.ok(!rows[0]?.password_hash.includes(PASSWORD));
    assert.equal((await authenticateUser({ email: email.toUpperCase(), password: PASSWORD })).id, id);
  });
  it('rejects duplicate email, wrong password and unknown email with safe errors', async () => {
    const { email } = await newUser();
    await assert.rejects(registerUser(creds(email)), { code: 'DUPLICATE_RESOURCE' });
    await assert.rejects(authenticateUser({ email, password: 'Wrong-Password-1' }), { code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    await assert.rejects(authenticateUser({ email: uniqueEmail(), password: PASSWORD }), { code: 'UNAUTHORIZED', message: 'Invalid email or password' });
  });
  it('refuses disabled accounts', async () => {
    const { id, email } = await newUser();
    await getPool().query(`UPDATE users SET is_active = false WHERE id = $1`, [id]);
    await assert.rejects(authenticateUser({ email, password: PASSWORD }), { code: 'UNAUTHORIZED' });
  });
  it('assigns exactly the requested role and never exposes hashes in admin listings', async () => {
    const { id } = await newUser('ADMIN');
    const page = await listUsers({ pageSize: 50 });
    const me = page.items.find((u) => u.id === id);
    assert.deepEqual(me?.roles, ['ADMIN']);
    assert.ok(!JSON.stringify(page).includes('scrypt$'));
  });
});

describe('user isolation (database)', { skip: !HAS_DB }, () => {
  it('saved papers are per user; save is idempotent; unsave works', async () => {
    const a = await newUser(); const b = await newUser();
    const c = await getPool().connect();
    let paperId: string;
    try { paperId = await insertPaper(c); } finally { c.release(); }
    assert.equal((await savePaperForUser(getPool(), a.id, paperId)).alreadySaved, false);
    assert.equal((await savePaperForUser(getPool(), a.id, paperId)).alreadySaved, true);
    assert.equal((await listSavedPapers(a.id, {})).total, 1);
    assert.equal((await listSavedPapers(b.id, {})).total, 0, 'other user sees nothing');
    assert.deepEqual(await unsavePaper(b.id, paperId), { removed: false }, 'cannot remove another user\'s save');
    assert.deepEqual(await unsavePaper(a.id, paperId), { removed: true });
    await getPool().query(`DELETE FROM papers WHERE id = $1`, [paperId]);
  });

  it('history and question access are owner-only (admin may read)', async () => {
    const a = await newUser(); const b = await newUser();
    const { rows: [q] } = await getPool().query<{ id: string }>(`INSERT INTO questions (user_id, question_text) VALUES ($1, 'what is X?') RETURNING id`, [a.id]);
    await getPool().query(`INSERT INTO search_queries (user_id, query_text, search_type) VALUES ($1, 'kw', 'KEYWORD'), ($1, 'sem', 'SEMANTIC')`, [a.id]);
    assert.equal((await listHistoryByKind(a.id, 'KEYWORD', {})).total, 1);
    assert.equal((await listHistoryByKind(a.id, 'SEMANTIC', {})).items[0]?.text, 'sem');
    assert.equal((await listHistoryByKind(a.id, 'QUESTION', {})).total, 1);
    for (const kind of ['KEYWORD', 'SEMANTIC', 'QUESTION'] as const) assert.equal((await listHistoryByKind(b.id, kind, {})).total, 0);
    await assert.rejects(getQuestion(q!.id, b.id, false), { code: 'FORBIDDEN' });
    assert.equal((await getQuestion(q!.id, b.id, true)).question, 'what is X?');
    await assert.rejects(getQuestion(randomUUID(), a.id, false), { code: 'NOT_FOUND' });
    await assert.rejects(getQuestion("'; DROP TABLE questions;--", a.id, false), { code: 'VALIDATION_ERROR' });
  });

  it('dashboard counts come from real rows and only admins get system totals', async () => {
    const a = await newUser();
    await getPool().query(`INSERT INTO search_queries (user_id, query_text, search_type) VALUES ($1, 'x', 'KEYWORD')`, [a.id]);
    const researcher = await getDashboard(a.id, false);
    assert.equal(researcher.mine.keywordSearches, 1);
    assert.equal(researcher.system, null);
    assert.ok((await getDashboard(a.id, true)).system);
  });
});

describe('admin operations (database)', { skip: !HAS_DB }, () => {
  it('cannot delete a category that is assigned to a paper', async () => {
    const cat = await createCategory({ name: `cat-${randomUUID()}` });
    const c = await getPool().connect();
    let paperId: string;
    try { paperId = await insertPaper(c); } finally { c.release(); }
    await getPool().query(`INSERT INTO paper_categories (paper_id, category_id) VALUES ($1, $2)`, [paperId, cat.categoryId]);
    await assert.rejects(deleteCategory(cat.categoryId), { code: 'DUPLICATE_RESOURCE' });
    await getPool().query(`DELETE FROM papers WHERE id = $1`, [paperId]);
    assert.deepEqual(await deleteCategory(cat.categoryId), { deleted: true });
  });
  it('analytics returns database-backed aggregates', async () => {
    const a = await getAnalytics();
    assert.equal(a.activityByDay.length, 14);
    assert.ok(typeof a.papersByStatus === 'object');
  });
});
