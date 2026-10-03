import { route } from '@/lib/api/route';
import { AppError } from '@/lib/errors';
import { getQuestion } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';

export const GET = route<{ id: string }>({
  permission: 'evidence:read',
  handler: async ({ user, params }) => {
    const q = await getQuestion(params.id, user.id, user.roles.includes('ADMIN')); // ownership check
    if (!q.answerId) throw new AppError('NOT_FOUND', 'This question has no answer');
    return { evidence: await researchiq.getAnswerEvidence(user, q.answerId) };
  },
});
