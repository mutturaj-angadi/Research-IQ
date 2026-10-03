import { route, readJson } from '@/lib/api/route';
import { startSession } from '@/lib/auth/session';
import { registerUser } from '@/lib/services/users';

export const POST = route({
  status: 201,
  rateLimit: { name: 'register', limit: 10, windowMs: 15 * 60_000 },
  handler: async ({ req }) => {
    const { id } = await registerUser(await readJson(req));
    await startSession(id);
    return { id };
  },
});
