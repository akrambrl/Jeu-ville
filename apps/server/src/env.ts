/** Configuration d'exécution (variables d'environnement). Les secrets ne sont jamais commités. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 2567),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};
