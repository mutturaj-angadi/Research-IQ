import { z } from 'zod';
import { MAX_PAGE_SIZE } from '../limits';
import { filtersSchema, paginationSchema, uuidSchema } from './schemas';

export { paginationSchema, uuidSchema, filtersSchema };

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Name is required').max(120),
    email,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });

/** Query-string friendly: numbers coerced, empty strings treated as absent. */
const optInt = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === undefined || v === null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());
const optStr = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().min(1).max(max).optional());

export const paperListQuerySchema = paginationSchema.extend({
  yearFrom: optInt(1900, 2100),
  yearTo: optInt(1900, 2100),
  venue: optStr(200),
  categoryId: optInt(1, 1_000_000),
});

export function toFilters(q: { yearFrom?: number; yearTo?: number; venue?: string; categoryId?: number }) {
  return {
    ...(q.yearFrom !== undefined && { yearFrom: q.yearFrom }),
    ...(q.yearTo !== undefined && { yearTo: q.yearTo }),
    ...(q.venue !== undefined && { venue: q.venue }),
    ...(q.categoryId !== undefined && { categoryIds: [q.categoryId] }),
  };
}

export const searchBodySchema = paperListQuerySchema.extend({
  query: z.string().trim().min(1).max(500),
});

export const semanticBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  topK: z.number().int().min(1).max(20).optional(),
  filters: filtersSchema.optional(),
});

export const askBodySchema = z.object({
  question: z.string().trim().min(3).max(2000),
  topK: z.number().int().min(1).max(20).optional(),
  filters: filtersSchema.optional(),
});

export const evidenceQuerySchema = z.object({ q: z.string().trim().min(1).max(500), topK: optInt(1, 20) });

export const categoryBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const pageOnlySchema = z.object({ page: paginationSchema.shape.page, pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20) });

export const processingQuerySchema = pageOnlySchema.extend({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
});

export const uploadMetadataFieldSchema = z.object({
  title: z.string().trim().min(1).max(1000).optional(),
  authors: z.string().trim().max(2000).optional(), // comma separated
  categories: z.string().trim().max(1000).optional(), // comma separated
  venue: z.string().trim().max(300).optional(),
  publicationYear: optInt(1900, 2100),
});

export const githubImportBodySchema = z.object({ assetId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
