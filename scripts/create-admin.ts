import { closePool, getPool, run } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';
import { withTransaction } from '../lib/db/transactions/withTransaction';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validation/schemas';
import { registerSchema } from '../lib/validation/app';

/** Usage: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin */
const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD in the environment.');
  process.exit(1);
}
try {
  const input = parseInput(registerSchema, { fullName: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD });
  const passwordHash = await hashPassword(input.password);
  await withTransaction(async (tx) => {
    const [user] = await run<{ id: string }>(tx, `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`, [input.email, passwordHash, input.fullName]);
    if (!user) throw new AppError('INTERNAL_ERROR', 'Admin account could not be created');
    const assigned = await run(tx, `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'ADMIN' RETURNING role_id`, [user.id]);
    if (assigned.length !== 1) throw new AppError('INTERNAL_ERROR', 'The admin role is unavailable');
  }, getPool());
  console.log(`Admin account created for ${ADMIN_EMAIL}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Failed to create admin');
  process.exitCode = 1;
} finally {
  await closePool();
}
