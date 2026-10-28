/**
 * Avant tous les tests : la base de test (TEST_DATABASE_URL) est migrée puis
 * vidée UNE fois, quel que soit l'ordre des fichiers de tests.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  process.env.DATABASE_URL = url;
  const { runMigrations } = await import('../db/migrate.js');
  const { pool } = await import('../db/client.js');
  await runMigrations();
  const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  if (rows.length > 0) await pool.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`);
  await pool.end();
}
