import { resolve } from 'node:path';
import { db } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { buildServer } from './app.js';
import { env } from './env.js';

await runMigrations();

const { gameServer } = await buildServer(db, { clientOrigin: env.clientOrigin, staticDir: env.clientDist && resolve(env.clientDist) });
await gameServer.listen(env.port);
console.log(`Serveur prêt sur le port ${env.port}${env.clientDist ? ' (jeu servi sur la même adresse)' : ''}`);
