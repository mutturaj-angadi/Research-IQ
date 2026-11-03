import { route, readJson } from '@/lib/api/route';
import { getPool } from '@/lib/db/client';
import { getRegisteredReleaseAsset, importReleaseAsset } from '@/lib/github/imports';
import { GitHubReleasesService } from '@/lib/github/releases';
import { researchiq } from '@/lib/services/researchiq';
import { githubImportBodySchema } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const POST = route({
  permission: 'papers:upload',
  rateLimit: { name: 'github-import', limit: 120, windowMs: 60 * 60_000, by: 'user' },
  handler: async ({ req, user }) => {
    const input = parseInput(githubImportBodySchema, await readJson(req, 1024));
    const github = new GitHubReleasesService();
    const asset = await getRegisteredReleaseAsset(getPool(), input.assetId);
    const result = await importReleaseAsset(getPool(), asset,
      (pdf) => researchiq.ingestPaper(user, pdf), user.id, github);
    return Response.json({ success: true, data: result }, { status: result.outcome === 'DUPLICATE' ? 200 : 201 });
  },
});
