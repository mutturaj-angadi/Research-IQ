import { route } from '@/lib/api/route';
import { getPool } from '@/lib/db/client';
import { listReleaseImports } from '@/lib/github/imports';

export const GET = route({
  permission: 'papers:upload',
  rateLimit: { name: 'github-releases', limit: 30, windowMs: 60 * 60_000, by: 'user' },
  handler: async () => ({ assets: await listReleaseImports(getPool()) }),
});
