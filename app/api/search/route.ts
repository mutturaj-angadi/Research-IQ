import { readJson, route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';
import { searchBodySchema, toFilters } from '@/lib/validation/app';
import { parseInput } from '@/lib/validation/schemas';

export const POST = route({
  permission: 'search:run',
  handler: async ({ req, user }) => {
    const b = parseInput(searchBodySchema, await readJson(req));
    return researchiq.searchPapers(user, { query: b.query, filters: toFilters(b), page: b.page, pageSize: b.pageSize });
  },
});
