import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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

  it('rejects malformed time claims, future issue times, and excessive lifetimes', () => {
    const sign = (payload: object) => {
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
      return `${body}.${sig}`;
    };
    for (const payload of [
      { sub: 'user', exp: 1_700_003_600 },
      { sub: 'user', iat: 1_700_000_061, exp: 1_700_003_600 },
      { sub: 'user', iat: 1_700_000_000, exp: 1_700_000_000 + 2_592_001 },
    ]) assert.equal(verifyToken(sign(payload), SECRET, T0), null);
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
    const valid = createToken('user-1', SECRET, 3600, T0);
    assert.equal(verifyToken(`${valid}%`, SECRET, T0), null);
    assert.equal(verifyToken(`${valid}.!`, SECRET, T0), null);
  });

  it('requires a strong secret', () => {
    assert.throws(() => assertSecret(undefined), /SESSION_SECRET must be set and at least 32 characters/);
    assert.throws(() => assertSecret(''), /SESSION_SECRET must be set and at least 32 characters/);
    assert.throws(() => assertSecret('short'));
    assert.equal(assertSecret(SECRET), SECRET);
  });
});
