import { AppError } from '../errors';
import type { AuthContext, Role } from '../types';

export function requireUser(ctx: AuthContext | undefined): asserts ctx is AuthContext {
  if (!ctx || !ctx.userId) throw new AppError('UNAUTHORIZED', 'Authentication is required');
}

export function requireRole(ctx: AuthContext | undefined, role: Role): asserts ctx is AuthContext {
  requireUser(ctx);
  if (!ctx.roles.includes(role)) throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
}
