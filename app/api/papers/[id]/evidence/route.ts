import { queryObject, route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';
import { evidenceQuerySchema } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const GET = route<{ id: string }>({
  permission: 'evidence:read',
  rateLimit: { name: 'paper-evidence', limit: 20, windowMs: 60_000, by: 'user' },
  handler: async ({ params, url }) => {
    const { q, topK } = parseInput(evidenceQuerySchema, queryObject(url));
    return researchiq.getPaperEvidence(params.id, q, topK);
  },
});
