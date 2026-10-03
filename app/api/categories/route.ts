import { queryObject, route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';
import { paginationSchema, parseInput } from '@/lib/validation/schemas';

export const GET = route({
  permission: 'papers:read',
  handler: async ({ url }) => researchiq.listCategories(parseInput(paginationSchema, queryObject(url))),
});
