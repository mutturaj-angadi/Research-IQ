import type { ErrorCode } from '../errors';
import { assertCan, type Permission } from '../auth/policy';
import { requireAuth, type CurrentUser } from '../auth/session';
import { clientIp, limiter } from '../security/ipLimiter';
import { assertSameOrigin, fail, ok, queryObject, readJson } from './response';

export interface RouteContext<P> { req: Request; user: CurrentUser; params: P; url: URL }
type RateLimit = { name: string; limit: number; windowMs: number; by?: 'ip' | 'user' };

interface Options<P> {
  /** Omit for public endpoints. Authentication is enforced server-side for any route that sets this. */
  permission?: Permission | 'authenticated';
  rateLimit?: RateLimit;
  status?: number;
  handler: (c: RouteContext<P>) => Promise<unknown>;
}

/** Route Handler -> auth -> authorization -> rate limit -> handler -> uniform JSON envelope. */
export function route<P = Record<string, never>>(opts: Options<P>) {
  return async (req: Request, ctx?: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      if (opts.rateLimit && opts.rateLimit.by !== 'user') limiter(opts.rateLimit.name, opts.rateLimit.limit, opts.rateLimit.windowMs).check(clientIp(req));
      let user: CurrentUser | undefined;
      if (opts.permission) {
        user = await requireAuth(opts.permission === 'authenticated' ? undefined : opts.permission);
        if (opts.rateLimit?.by === 'user') limiter(opts.rateLimit.name, opts.rateLimit.limit, opts.rateLimit.windowMs).check(user.id);
      }
      const params = (ctx?.params ? await ctx.params : {}) as P;
      const data = await opts.handler({ req, user: user as CurrentUser, params, url: new URL(req.url) });
      if (data instanceof Response) return data;
      return ok(data, opts.status);
    } catch (err) {
      return fail(err);
    }
  };
}

export type { ErrorCode };
export { assertCan, fail, ok, queryObject, readJson };
