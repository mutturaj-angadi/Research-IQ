import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionPayload { sub: string; iat: number; exp: number }

const b64u = (b: Buffer | string): string => Buffer.from(b).toString('base64url');
const sign = (body: string, secret: string): Buffer => createHmac('sha256', secret).update(body).digest();

export function assertSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set and at least 32 characters');
  return secret;
}

/** Compact signed token: base64url(payload).base64url(HMAC-SHA256). Contains only user id and timestamps. */
export function createToken(userId: string, secret: string, maxAgeSeconds: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const body = b64u(JSON.stringify({ sub: userId, iat, exp: iat + maxAgeSeconds } satisfies SessionPayload));
  return `${body}.${b64u(sign(body, secret))}`;
}

export function verifyToken(token: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const expected = sign(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || b64u(given) !== sig || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    const nowSeconds = Math.floor(now / 1000);
    // The signed payload is still untrusted input until every claim and the token lifetime is checked.
    if (
      !p || typeof p.sub !== 'string' || p.sub.length < 1 || p.sub.length > 128 ||
      typeof p.iat !== 'number' || !Number.isSafeInteger(p.iat) ||
      typeof p.exp !== 'number' || !Number.isSafeInteger(p.exp) ||
      p.iat > nowSeconds + 60 || p.exp <= nowSeconds || p.exp <= p.iat ||
      p.exp - p.iat > 2_592_000
    ) return null;
    return p;
  } catch {
    return null;
  }
}
