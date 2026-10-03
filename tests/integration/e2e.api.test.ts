// End-to-end API journey against a RUNNING app (npm run dev / start). Enable with:
//   E2E_BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

const BASE = process.env.E2E_BASE_URL;
const skip = !BASE;

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(this.cookie && { cookie: this.cookie }), ...(method !== 'GET' && { origin: BASE! }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: any; error?: { code: string } } | null;
    return { status: res.status, json, headers: res.headers };
  }
}

describe('researcher journey (e2e API)', { skip }, () => {
  const email = `e2e-${randomUUID()}@example.test`;
  const pw = 'E2e-Password-1';
  const user = new Client();

  it('blocks anonymous access', async () => {
    for (const p of ['/api/auth/me', '/api/papers', '/api/saved', '/api/history', '/api/admin/users', '/api/admin/analytics']) {
      const r = await new Client().call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json?.error?.code, 'UNAUTHORIZED');
    }
  });
  it('registers with validation, sets an HttpOnly cookie, and logs out', async () => {
    assert.equal((await new Client().call('POST', '/api/auth/register', { fullName: 'E', email: 'bad', password: 'weak', confirmPassword: 'weak' })).status, 400);
    const r = await user.call('POST', '/api/auth/register', { fullName: 'E2E User', email, password: pw, confirmPassword: pw });
    assert.equal(r.status, 201);
    assert.match(r.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.equal((await new Client().call('POST', '/api/auth/register', { fullName: 'E2E User', email, password: pw, confirmPassword: pw })).json?.error?.code, 'CONFLICT');
    assert.equal((await user.call('GET', '/api/auth/me')).json?.data.user.roles[0], 'RESEARCHER');
    assert.ok(!JSON.stringify((await user.call('GET', '/api/auth/me')).json).includes('password'));
  });
  it('rejects wrong credentials', async () => {
    assert.equal((await new Client().call('POST', '/api/auth/login', { email, password: 'Wrong-Password-1' })).status, 401);
  });
  it('browses papers with bounded pagination and rejects bad input', async () => {
    const list = await user.call('GET', '/api/papers?page=1&pageSize=5');
    assert.equal(list.status, 200);
    assert.ok(list.json!.data.items.length <= 5);
    assert.equal((await user.call('GET', '/api/papers?pageSize=1000')).status, 400);
    assert.equal((await user.call('GET', "/api/papers/'; DROP TABLE papers;--")).status, 400);
    assert.equal((await user.call('GET', `/api/papers/${randomUUID()}`)).status, 404);
    assert.equal((await user.call('POST', '/api/search', { query: 'x'.repeat(501) })).status, 400);
  });
  it('searches, saves, lists and removes a saved paper, and records history', async () => {
    const first = (await user.call('GET', '/api/papers?pageSize=1')).json!.data.items[0];
    if (!first) return; // empty library: nothing further to exercise
    assert.equal((await user.call('POST', '/api/search', { query: first.title.split(' ')[0] })).status, 200);
    assert.equal((await user.call('PUT', `/api/saved/${first.paperId}`)).json?.data.alreadySaved, false);
    assert.equal((await user.call('PUT', `/api/saved/${first.paperId}`)).json?.data.alreadySaved, true);
    assert.equal((await user.call('GET', '/api/saved')).json?.data.total, 1);
    assert.ok(((await user.call('GET', '/api/history?kind=KEYWORD')).json?.data.total ?? 0) >= 1);
    assert.equal((await user.call('DELETE', `/api/saved/${first.paperId}`)).json?.data.removed, true);
  });
  it('malformed JSON is a 400, and cross-origin POSTs are refused', async () => {
    const res = await fetch(`${BASE}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: user.cookie }, body: '{bad' });
    assert.equal(res.status, 400);
    const cross = await fetch(`${BASE}/api/saved`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: user.cookie, origin: 'http://evil.test' }, body: '{}' });
    assert.equal(cross.status, 403);
  });
  it('forbids every admin endpoint for a researcher (privilege escalation)', async () => {
    for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/admin/papers'], ['GET', '/api/admin/processing'], ['GET', '/api/admin/analytics'], ['GET', '/api/admin/categories'], ['POST', '/api/admin/categories']] as const) {
      const r = await user.call(m, p, m === 'POST' ? { name: 'x' } : undefined);
      assert.equal(r.status, 403, `${m} ${p}`);
    }
    const upload = new FormData();
    upload.set('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'a.pdf');
    const res = await fetch(`${BASE}/api/admin/papers`, { method: 'POST', headers: { cookie: user.cookie, origin: BASE! }, body: upload });
    assert.equal(res.status, 403);
  });
  it('cannot read another user\'s question', async () => {
    assert.equal((await user.call('GET', `/api/questions/${randomUUID()}`)).status, 404);
  });
  it('logout invalidates the browser session', async () => {
    await user.call('POST', '/api/auth/logout');
    user.cookie = '';
    assert.equal((await user.call('GET', '/api/auth/me')).status, 401);
  });
});

describe('admin journey (e2e API)', { skip: skip || !process.env.ADMIN_EMAIL }, () => {
  const admin = new Client();
  it('logs in and reaches admin endpoints', async () => {
    assert.equal((await admin.call('POST', '/api/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).status, 200);
    for (const p of ['/api/admin/users', '/api/admin/papers', '/api/admin/processing', '/api/admin/analytics', '/api/admin/categories']) {
      assert.equal((await admin.call('GET', p)).status, 200, p);
    }
    const users = (await admin.call('GET', '/api/admin/users')).json;
    assert.ok(!JSON.stringify(users).includes('password'));
  });
  it('rejects non-PDF and mislabelled uploads', async () => {
    const send = (blob: Blob, name: string) => { const f = new FormData(); f.set('file', blob, name); return fetch(`${BASE}/api/admin/papers`, { method: 'POST', headers: { cookie: admin.cookie, origin: BASE! }, body: f }); };
    assert.equal((await send(new Blob(['hello'], { type: 'text/plain' }), 'a.txt')).status, 400);
    assert.equal((await send(new Blob(['MZ\u0090 not a pdf'], { type: 'application/pdf' }), 'evil.pdf')).status, 422);
    assert.equal((await send(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), '../../etc/passwd.pdf')).status, 400);
  });
});
