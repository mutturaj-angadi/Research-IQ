import { route } from '@/lib/api/route';
import { getPool } from '@/lib/db/client';
import { syncReleaseAssets } from '@/lib/github/imports';

export const POST = route({
  permission: 'papers:upload',
  rateLimit: { name: 'github-sync', limit: 10, windowMs: 60 * 60_000, by: 'user' },
  handler: async ({ user }) => syncReleaseAssets(getPool(), user.id),
});
