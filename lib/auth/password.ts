import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

/** Format: scrypt$N$r$p$<salt b64>$<hash b64>. Only this string is ever stored. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string' || stored.length > 256) return false;
  const [alg, n, r, p, saltB64, hashB64, extra] = stored.split('$');
  // Do not allow a malformed/corrupted database value to select unbounded scrypt parameters.
  if (alg !== 'scrypt' || n !== String(N) || r !== String(R) || p !== String(P) || !saltB64 || !hashB64 || extra !== undefined) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const salt = Buffer.from(saltB64, 'base64');
  if (salt.length !== 16 || expected.length !== KEYLEN || salt.toString('base64') !== saltB64 || expected.toString('base64') !== hashB64) return false;
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
