import { AppError } from '../errors';
import type { Role } from '../types';

/** Authorization matrix. Enforced in route handlers via `route({ permission })` and in page guards. */
export const PERMISSIONS = {
  'papers:read': ['RESEARCHER', 'ADMIN'],
  'search:run': ['RESEARCHER', 'ADMIN'],
  'qa:ask': ['RESEARCHER', 'ADMIN'],
  'evidence:read': ['RESEARCHER', 'ADMIN'],
  'saved:manage': ['RESEARCHER', 'ADMIN'],
  'history:read-own': ['RESEARCHER', 'ADMIN'],
  'dashboard:own': ['RESEARCHER', 'ADMIN'],
  'papers:upload': ['ADMIN'],
  'papers:process': ['ADMIN'],
  'categories:manage': ['ADMIN'],
  'users:read': ['ADMIN'],
  'analytics:system': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export function assertCan(roles: readonly Role[], permission: Permission): void {
  if (!can(roles, permission)) throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
}
