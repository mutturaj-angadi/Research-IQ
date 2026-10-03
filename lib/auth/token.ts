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
  if (!body || !sig || extra !== undefined) return null;
  const expected = sign(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || p.exp * 1000 <= now) return null;
    return p;
  } catch {
    return null;
  }
}
