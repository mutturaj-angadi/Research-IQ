import { queryObject, route } from '@/lib/api/route';
import { listProcessing } from '@/lib/services/library';

export const GET = route({ permission: 'papers:process', handler: async ({ url }) => listProcessing(queryObject(url)) });
