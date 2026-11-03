import { queryObject, route } from '@/lib/api/route';
import { AppError } from '@/lib/errors';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';
import { researchiq } from '@/lib/services/researchiq';
import { paperListQuerySchema, toFilters, uploadMetadataFieldSchema } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const GET = route({
  permission: 'papers:process',
  handler: async ({ url }) => {
    const q = parseInput(paperListQuerySchema, queryObject(url));
    return researchiq.listPapers({ page: q.page, pageSize: q.pageSize }, toFilters(q));
  },
});

const list = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

/** Admin-only PDF upload. Size/type are re-validated server-side; Member 1's pipeline checks the %PDF- magic bytes. */
export const POST = route({
  permission: 'papers:upload',
  rateLimit: { name: 'upload', limit: 10, windowMs: 60 * 60_000, by: 'user' },
  handler: async ({ req, user }) => {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'multipart/form-data' || !/;\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType)) {
      throw new AppError('VALIDATION_ERROR', 'Expected a multipart/form-data upload');
    }
    const contentLength = req.headers.get('content-length');
    if (contentLength !== null) {
      if (!/^(0|[1-9][0-9]*)$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
        throw new AppError('VALIDATION_ERROR', 'Invalid Content-Length');
      }
      if (Number(contentLength) > MAX_UPLOAD_BYTES + 1024 * 1024) throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large');
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Malformed multipart/form-data upload');
    }
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION_ERROR', 'A PDF file is required');
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large');
    if (file.type !== 'application/pdf') throw new AppError('VALIDATION_ERROR', 'Only PDF files are accepted');
    const f = parseInput(uploadMetadataFieldSchema, Object.fromEntries(
      ['title', 'authors', 'categories', 'venue', 'publicationYear'].map((k) => [k, form.get(k) ?? undefined]),
    ));
    const metadata = {
      ...(f.title && { title: f.title }),
      ...(f.venue && { venue: f.venue }),
      ...(f.publicationYear && { publicationYear: f.publicationYear }),
      ...(list(f.authors) && { authors: list(f.authors) }),
      ...(list(f.categories) && { categories: list(f.categories) }),
    };
    // fileName is used only for validation/metadata detection; it is never used as a filesystem path.
    const result = await researchiq.ingestPaper(user, { buffer: new Uint8Array(await file.arrayBuffer()), fileName: file.name, mimeType: file.type, metadata });
    return Response.json({ success: true, data: result }, { status: result.outcome === 'DUPLICATE' ? 200 : 201 });
  },
});
