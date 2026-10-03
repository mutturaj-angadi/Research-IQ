import { queryObject, readJson, route } from '@/lib/api/route';
import { listSavedPapers } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';
import { paginationSchema, parseInput, uuidSchema } from '@/lib/validation/schemas';
import { z } from 'zod';

export const GET = route({
  permission: 'saved:manage',
  handler: async ({ user, url }) => listSavedPapers(user.id, parseInput(paginationSchema, queryObject(url))),
});

export const POST = route({
  permission: 'saved:manage',
  handler: async ({ req, user }) => {
    const { paperId } = parseInput(z.object({ paperId: uuidSchema }), await readJson(req));
    return researchiq.savePaper(user, paperId);
  },
});
