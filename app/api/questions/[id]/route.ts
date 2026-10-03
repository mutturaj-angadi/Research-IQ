import { route } from '@/lib/api/route';
import { getQuestion } from '@/lib/services/library';

export const GET = route<{ id: string }>({
  permission: 'history:read-own',
  handler: async ({ user, params }) => getQuestion(params.id, user.id, user.roles.includes('ADMIN')),
});
