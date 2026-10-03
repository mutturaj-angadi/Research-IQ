import { route } from '@/lib/api/route';
import { getAnalytics } from '@/lib/services/library';

export const GET = route({ permission: 'analytics:system', handler: async () => getAnalytics() });
