import { z } from 'zod';
import { AppError } from './errors';

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),

    EMBEDDING_API_KEY: z.string().min(1).optional(),
    EMBEDDING_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
    EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(256).default(32),

    AI_API_KEY: z.string().min(1).optional(),
    AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    AI_MODEL: z.string().min(1).default('gpt-4o-mini'),

    CHUNK_SIZE_CHARS: z.coerce.number().int().min(300).max(4000).default(1200),
    CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(1000).default(200),
  })
  .refine((c) => c.CHUNK_OVERLAP_CHARS * 2 <= c.CHUNK_SIZE_CHARS, {
    path: ['CHUNK_OVERLAP_CHARS'],
    message: 'must be at most half of CHUNK_SIZE_CHARS',
  });

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

/** Loads configuration from the environment once. Error messages name the variables, never their values. */
export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new AppError('INTERNAL_ERROR', `Invalid server configuration: ${names}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetConfigCache(): void {
  cached = undefined;
}
