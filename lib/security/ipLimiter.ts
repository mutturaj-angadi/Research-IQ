import { FixedWindowRateLimiter } from './rateLimit';

const limiters = new Map<string, FixedWindowRateLimiter>();

/** Named in-process limiters (reuses Member 1's FixedWindowRateLimiter). */
export function limiter(name: string, limit: number, windowMs: number): FixedWindowRateLimiter {
  let l = limiters.get(name);
  if (!l) limiters.set(name, (l = new FixedWindowRateLimiter(limit, windowMs)));
  return l;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
