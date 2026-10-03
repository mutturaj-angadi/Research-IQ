import { readJson, route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';
import { semanticBodySchema } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const POST = route({
  permission: 'search:run',
  rateLimit: { name: 'semantic', limit: 20, windowMs: 60_000, by: 'user' },
  handler: async ({ req, user }) => researchiq.semanticSearch(user, parseInput(semanticBodySchema, await readJson(req))),
});
