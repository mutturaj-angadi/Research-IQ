import { route } from '@/lib/api/route';
import { researchiq } from '@/lib/services/researchiq';

// Ownership (owner or admin) is enforced inside Member 1's getAnswerEvidence.
export const GET = route<{ answerId: string }>({
  permission: 'evidence:read',
  handler: async ({ user, params }) => ({ evidence: await researchiq.getAnswerEvidence(user, params.answerId) }),
});
