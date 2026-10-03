import { queryObject, readJson, route } from '@/lib/api/route';
import { listHistoryByKind } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';
import { askBodySchema } from '@/lib/validation/app';
import { paginationSchema, parseInput } from '@/lib/validation/schemas';

export const POST = route({
  permission: 'qa:ask',
  rateLimit: { name: 'ask', limit: 10, windowMs: 60_000, by: 'user' },
  handler: async ({ req, user }) => researchiq.ask(user, parseInput(askBodySchema, await readJson(req))),
});

export const GET = route({
  permission: 'history:read-own',
  handler: async ({ user, url }) => listHistoryByKind(user.id, 'QUESTION', parseInput(paginationSchema, queryObject(url))),
});
