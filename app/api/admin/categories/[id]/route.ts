import { readJson, route } from '@/lib/api/route';
import { deleteCategory, updateCategory } from '@/lib/services/library';

export const PATCH = route<{ id: string }>({ permission: 'categories:manage', handler: async ({ req, params }) => updateCategory(params.id, await readJson(req)) });
export const DELETE = route<{ id: string }>({ permission: 'categories:manage', handler: async ({ params }) => deleteCategory(params.id) });
