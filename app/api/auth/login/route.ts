import { route, readJson } from '@/lib/api/route';
import { loadUser, startSession } from '@/lib/auth/session';
import { authenticateUser } from '@/lib/services/users';

export const POST = route({
  rateLimit: { name: 'login', limit: 10, windowMs: 15 * 60_000 },
  handler: async ({ req }) => {
    const { id } = await authenticateUser(await readJson(req));
    await startSession(id);
    const u = await loadUser(id);
    return { user: u && { id: u.id, email: u.email, fullName: u.fullName, roles: u.roles } };
  },
});
