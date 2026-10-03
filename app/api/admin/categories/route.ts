import { queryObject, readJson, route } from '@/lib/api/route';
import { createCategory } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';

export const GET = route({ permission: 'categories:manage', handler: async ({ url }) => researchiq.listCategories(queryObject(url)) });
export const POST = route({ permission: 'categories:manage', status: 201, handler: async ({ req }) => createCategory(await readJson(req)) });
