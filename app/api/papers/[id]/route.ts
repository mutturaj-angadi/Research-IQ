import { route } from '@/lib/api/route';
import { isPaperSaved } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';

export const GET = route<{ id: string }>({
  permission: 'papers:read',
  handler: async ({ params, user }) => {
    const paper = await researchiq.getPaper(params.id);
    return { ...paper, saved: await isPaperSaved(user.id, paper.paperId) };
  },
});
