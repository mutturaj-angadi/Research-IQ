import { queryObject, route } from '@/lib/api/route';
import { listUsers } from '@/lib/services/users';

export const GET = route({ permission: 'users:read', handler: async ({ url }) => listUsers(queryObject(url)) });
