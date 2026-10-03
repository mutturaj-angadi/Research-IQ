import { closePool } from '../lib/db/client';
import { registerUser } from '../lib/services/users';

/** Usage: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin */
const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD in the environment.');
  process.exit(1);
}
try {
  await registerUser({ fullName: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD }, 'ADMIN');
  console.log(`Admin account created for ${ADMIN_EMAIL}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Failed to create admin');
  process.exitCode = 1;
} finally {
  await closePool();
}
