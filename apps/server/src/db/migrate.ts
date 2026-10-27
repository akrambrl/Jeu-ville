import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

export const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// Lancé directement : `pnpm db:migrate`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations();
  await pool.end();
  console.log('Migrations appliquées.');
}
