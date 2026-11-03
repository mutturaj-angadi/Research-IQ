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
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
  if (origin) {
    try {
      const parsed = new URL(origin);
      const host = req.headers.get('host');
      if (!host || !['http:', 'https:'].includes(parsed.protocol) || parsed.host !== host) {
        throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
    }
  }
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const contentLength = req.headers.get('content-length');
  let declared: number | undefined;
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
      throw new AppError('VALIDATION_ERROR', 'Invalid Content-Length');
    }
    declared = Number(contentLength);
    if (declared > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('VALIDATION_ERROR', 'Request body could not be read');
  } finally {
    reader.releaseLock();
  }
  if (declared !== undefined && declared !== size) throw new AppError('VALIDATION_ERROR', 'Content-Length does not match request body');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

export function queryObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}
