import { getPool, run } from '../db/client';
import { withTransaction } from '../db/transactions/withTransaction';
import { hashPassword, verifyPassword } from '../auth/password';
import { AppError, getPgCode } from '../errors';
import type { Page, Role } from '../types';
import { paginationSchema, parseInput, totalPages } from '../validation/schemas';
import { loginSchema, registerSchema } from '../validation/app';

export interface UserDTO { id: string; email: string; fullName: string; roles: Role[]; isActive: boolean; createdAt: string }

// Verified against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/** New accounts are always RESEARCHER. Admins are created out of band (`npm run create-admin`) or by an admin. */
export async function registerUser(raw: unknown, role: Role = 'RESEARCHER'): Promise<{ id: string }> {
  const input = parseInput(registerSchema, raw);
  const passwordHash = await hashPassword(input.password);
  try {
    return await withTransaction(async (tx) => {
      const [u] = await run<{ id: string }>(
        tx,
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
        [input.email, passwordHash, input.fullName],
      );
      const id = (u as { id: string }).id;
      await run(tx, `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`, [id, role]);
      return { id };
    });
  } catch (err) {
    const cause = err instanceof AppError ? err.cause : err;
    if (getPgCode(cause) === '23505') throw new AppError('DUPLICATE_RESOURCE', 'An account with this email already exists');
    throw err;
  }
}

export async function authenticateUser(raw: unknown): Promise<{ id: string }> {
  const { email, password } = parseInput(loginSchema, raw);
  const [row] = await run<{ id: string; password_hash: string; is_active: boolean }>(
    getPool(), `SELECT id, password_hash, is_active FROM users WHERE email = $1`, [email],
  );
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.is_active) throw new AppError('UNAUTHORIZED', 'Invalid email or password');
  return { id: row.id };
}

/** Admin only (enforced by the caller). Never selects password_hash. */
export async function listUsers(rawPaging: unknown): Promise<Page<UserDTO>> {
  const { page, pageSize } = parseInput(paginationSchema, rawPaging ?? {});
  const rows = await run<{ id: string; email: string; full_name: string; is_active: boolean; created_at: Date; roles: Role[]; total: string }>(
    getPool(),
    `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
            COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles,
            count(*) OVER () AS total
     FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id ORDER BY u.created_at DESC, u.id LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name, roles: r.roles, isActive: r.is_active, createdAt: r.created_at.toISOString() })),
    page, pageSize, total, totalPages: totalPages(total, pageSize),
  };
}
