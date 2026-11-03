import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestLogout, setPaperSaved } from '../../lib/ui/actions';

describe('client UI actions', () => {
  it('posts logout and rejects failed responses', async () => {
    let request: RequestInit | undefined;
    await requestLogout(async (_url, init) => {
      request = init;
      return new Response(null, { status: 200 });
    });
    assert.equal(request?.method, 'POST');

    await assert.rejects(
      requestLogout(async () => new Response(null, { status: 503 })),
      /Could not log out/,
    );
    await assert.rejects(requestLogout(async () => { throw new Error('offline'); }), /offline/);
  });

  it('uses PUT to save and DELETE to unsave, surfacing API errors', async () => {
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      methods.push(`${String(url)} ${init?.method}`);
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    };
    await setPaperSaved('paper-1', true, fetchImpl);
    await setPaperSaved('paper-1', false, fetchImpl);
    assert.deepEqual(methods, ['/api/saved/paper-1 PUT', '/api/saved/paper-1 DELETE']);

    await assert.rejects(
      setPaperSaved('paper-1', true, async () => new Response(JSON.stringify({ error: { message: 'Sign in required.' } }), { status: 401 })),
      /Sign in required/,
    );
  });
});
