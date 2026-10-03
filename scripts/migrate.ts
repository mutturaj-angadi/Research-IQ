import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../lib/db/client';
import { errorFields, logger } from '../lib/logger';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'migrations');

async function main(): Promise<void> {
  const down = process.argv.includes('--down');
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const names = (await readdir(dir)).filter((f) => f.endsWith('.up.sql')).map((f) => f.replace('.up.sql', '')).sort();

  if (down) {
    const last = [...names].reverse().find((n) => applied.has(n));
    if (!last) return void logger.info('migrate.nothing_to_revert');
    await pool.query(await readFile(path.join(dir, `${last}.down.sql`), 'utf8'));
    await pool.query('DELETE FROM schema_migrations WHERE name = $1', [last]);
    return void logger.info('migrate.reverted', { name: last });
  }
  for (const name of names.filter((n) => !applied.has(n))) {
    await pool.query(await readFile(path.join(dir, `${name}.up.sql`), 'utf8')); // each file wraps itself in BEGIN/COMMIT
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    logger.info('migrate.applied', { name });
  }
}

main()
  .catch((err) => {
    logger.error('migrate.failed', errorFields(err));
    process.exitCode = 1;
  })
  .finally(closePool);
