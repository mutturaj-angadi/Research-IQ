import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPool, run } from '../db/client';
import { AppError } from '../errors';
import type { AuthContext, Role } from '../types';
import { assertCan, can, type Permission } from './policy';
import { assertSecret, createToken, verifyToken } from './token';

export const SESSION_COOKIE = 'riq_session';

export interface CurrentUser { id: string; email: string; fullName: string; roles: Role[] }

const secret = (): string => assertSecret(process.env.SESSION_SECRET);
const maxAge = (): number => Math.min(Math.max(Number(process.env.SESSION_MAX_AGE_SECONDS) || 604_800, 300), 2_592_000);

export const toAuthContext = (u: CurrentUser): AuthContext => ({ userId: u.id, roles: u.roles });

export async function loadUser(id: string): Promise<CurrentUser | null> {
  const rows = await run<{ id: string; email: string; full_name: string; roles: Role[] }>(
    getPool(),
    `SELECT u.id, u.email, u.full_name,
            COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 AND u.is_active GROUP BY u.id`,
    [id],
  );
  const u = rows[0];
  return u ? { id: u.id, email: u.email, fullName: u.full_name, roles: u.roles } : null;
}

export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createToken(userId, secret(), maxAge()), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: maxAge(),
  });
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Re-reads the user from the database every request, so deactivation and role changes apply immediately. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifyToken(token, secret());
  return payload ? loadUser(payload.sub) : null;
});

/** For route handlers: throws AppError (401/403) -> JSON envelope. */
export async function requireAuth(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication is required');
  if (permission) assertCan(user.roles, permission);
  return user;
}

export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!user.roles.includes(role)) throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
  return user;
}

/** For pages: redirects instead of throwing. */
export async function requirePageUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (permission && !can(user.roles, permission)) redirect('/dashboard?denied=1');
  return user;
}
