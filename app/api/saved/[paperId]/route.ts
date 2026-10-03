import { route } from '@/lib/api/route';
import { unsavePaper } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';

export const PUT = route<{ paperId: string }>({
  permission: 'saved:manage',
  handler: async ({ user, params }) => researchiq.savePaper(user, params.paperId),
});

export const DELETE = route<{ paperId: string }>({
  permission: 'saved:manage',
  handler: async ({ user, params }) => unsavePaper(user.id, params.paperId),
});
