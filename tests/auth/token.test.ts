import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSecret, createToken, verifyToken } from '../../lib/auth/token';

const SECRET = 'a'.repeat(40);
const T0 = 1_700_000_000_000;

describe('session tokens', () => {
  it('round-trips the user id', () => {
    const t = createToken('user-1', SECRET, 3600, T0);
    assert.equal(verifyToken(t, SECRET, T0 + 1000)?.sub, 'user-1');
  });

  it('rejects expired tokens', () => {
    const t = createToken('user-1', SECRET, 60, T0);
    assert.equal(verifyToken(t, SECRET, T0 + 61_000), null);
  });

  it('rejects a different secret and tampered payloads', () => {
    const t = createToken('user-1', SECRET, 3600, T0);
    assert.equal(verifyToken(t, 'b'.repeat(40), T0), null);
    const [, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin-user', iat: 0, exp: 9_999_999_999 })).toString('base64url');
    assert.equal(verifyToken(`${forged}.${sig}`, SECRET, T0), null);
  });

  it('rejects garbage', () => {
    for (const bad of [undefined, '', 'abc', 'a.b.c', '.', 'x'.repeat(2000)]) assert.equal(verifyToken(bad, SECRET, T0), null);
  });

  it('requires a strong secret', () => {
    assert.throws(() => assertSecret(undefined));
    assert.throws(() => assertSecret('short'));
    assert.equal(assertSecret(SECRET), SECRET);
  });
});
