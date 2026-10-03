import { queryObject, route } from '@/lib/api/route';
import { listHistoryByKind } from '@/lib/services/library';
import { paginationSchema, parseInput } from '@/lib/validation/schemas';
import { z } from 'zod';

const q = paginationSchema.extend({ kind: z.enum(['KEYWORD', 'SEMANTIC', 'QUESTION']).default('KEYWORD') });

export const GET = route({
  permission: 'history:read-own',
  handler: async ({ user, url }) => {
    const { kind, ...paging } = parseInput(q, queryObject(url));
    return listHistoryByKind(user.id, kind, paging);
  },
});
