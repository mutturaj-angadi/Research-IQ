import { queryObject, route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';
import { paperListQuerySchema, toFilters } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const GET = route({
  permission: 'papers:read',
  handler: async ({ url }) => {
    const q = parseInput(paperListQuerySchema, queryObject(url));
    return researchiq.listPapers({ page: q.page, pageSize: q.pageSize }, toFilters(q));
  },
});
