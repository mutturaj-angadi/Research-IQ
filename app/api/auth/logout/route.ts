import { route } from '@/lib/api/route';
import { logout } from '@/lib/auth/session';

export const POST = route({ handler: async () => { await logout(); return { loggedOut: true }; } });
