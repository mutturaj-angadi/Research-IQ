import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../../lib/auth/password';

describe('password hashing', () => {
  it('never stores the plaintext and verifies the right password only', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    assert.ok(hash.startsWith('scrypt$'));
    assert.ok(!hash.includes('Correct-Horse-9'));
    assert.ok(hash.length >= 20, 'satisfies the users.password_hash CHECK constraint');
    assert.equal(await verifyPassword('Correct-Horse-9', hash), true);
    assert.equal(await verifyPassword('correct-horse-9', hash), false);
  });

  it('uses a unique salt per hash', async () => {
    assert.notEqual(await hashPassword('Same-Password-1'), await hashPassword('Same-Password-1'));
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    for (const bad of ['', 'plaintext', 'bcrypt$1$2$3$4$5', 'scrypt$x']) assert.equal(await verifyPassword('x', bad), false);
  });
});
