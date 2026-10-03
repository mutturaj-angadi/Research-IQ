import { z } from 'zod';
import { AppError } from '../errors';
import {
  DEFAULT_MAX_CHUNKS_PER_PAPER,
  DEFAULT_MIN_SIMILARITY,
  DEFAULT_PAGE_SIZE,
  DEFAULT_TOP_K,
  MAX_FILTER_CATEGORY_IDS,
  MAX_FILTER_PAPER_IDS,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TOP_K,
  MAX_UPLOAD_BYTES,
} from '../limits';

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const year = z.number().int().min(1900).max(2100);

export const filtersSchema = z
  .object({
    yearFrom: year.optional(),
    yearTo: year.optional(),
    categoryIds: z.array(z.number().int().positive()).max(MAX_FILTER_CATEGORY_IDS).optional(),
    authorId: uuidSchema.optional(),
    venue: z.string().trim().min(1).max(200).optional(),
    paperIds: z.array(uuidSchema).max(MAX_FILTER_PAPER_IDS).optional(),
  })
  .strict()
  .refine((f) => f.yearFrom === undefined || f.yearTo === undefined || f.yearFrom <= f.yearTo, {
    message: 'yearFrom must be <= yearTo',
    path: ['yearFrom'],
  });

const queryText = z.string().trim().min(1).max(MAX_QUERY_LENGTH);

export const keywordSearchSchema = z
  .object({ query: queryText, filters: filtersSchema.default({}) })
  .merge(paginationSchema);

const topK = z.number().int().min(1).max(MAX_TOP_K).default(DEFAULT_TOP_K);

export const semanticSearchSchema = z.object({
  query: queryText,
  topK,
  filters: filtersSchema.default({}),
  minSimilarity: z.number().min(-1).max(1).default(DEFAULT_MIN_SIMILARITY),
  maxChunksPerPaper: z.number().int().min(1).max(MAX_TOP_K).default(DEFAULT_MAX_CHUNKS_PER_PAPER),
});

export const askSchema = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_LENGTH),
  topK: topK.default(5),
  filters: filtersSchema.default({}),
});

export const paperMetadataSchema = z.object({
  title: z.string().trim().min(1).max(1000),
  abstract: z.string().trim().min(1).max(20_000).optional(),
  publicationYear: year.optional(),
  doi: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^10\.\d{4,9}\/\S+$/, 'invalid DOI')
    .optional(),
  venue: z.string().trim().min(1).max(300).optional(),
  url: z.string().url().regex(/^https?:\/\//).max(2000).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/).default('en'),
  authors: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  categories: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const uploadMetaSchema = z.object({
  fileName: z
    .string()
    .min(5)
    .max(255)
    .regex(/^[^/\\\0]+\.pdf$/i, 'file name must end in .pdf and contain no path separators'),
  mimeType: z.literal('application/pdf'),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export type Filters = z.infer<typeof filtersSchema>;
export type KeywordSearchInput = z.infer<typeof keywordSearchSchema>;
export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;
export type AskInput = z.infer<typeof askSchema>;
export type PaperMetadataInput = z.infer<typeof paperMetadataSchema>;
export type Pagination = z.infer<typeof paginationSchema>;

/** Parses untrusted input; failures become a VALIDATION_ERROR whose details list only field paths and messages. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError('VALIDATION_ERROR', 'Invalid input', details);
  }
  return result.data;
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
