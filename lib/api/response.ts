import { AppError, toErrorResponse } from '../errors';
import { errorFields, logger } from '../logger';

const PUBLIC_CODE: Record<string, string> = { DUPLICATE_RESOURCE: 'CONFLICT' };

export function fail(err: unknown): Response {
  const { status, body } = toErrorResponse(err);
  if (status >= 500) logger.error('api.error', errorFields(err));
  return Response.json({ success: false, error: { ...body.error, code: PUBLIC_CODE[body.error.code] ?? body.error.code } }, { status });
}

export const ok = (data: unknown, status = 200): Response => Response.json({ success: true, data }, { status });

/** Cheap CSRF defence on top of SameSite=Lax: a browser-supplied Origin must match the Host. */
export function assertSameOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError('VALIDATION_ERROR', 'Request body is too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

export function queryObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

