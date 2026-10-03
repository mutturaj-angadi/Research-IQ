import { route } from '@/lib/api/route';

export const GET = route({ permission: 'authenticated', handler: async ({ user }) => ({ user }) });
