import { resolve } from 'node:path';
import { db } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedReferenceData } from './db/seed.js';
import { buildServer } from './app.js';
import { env } from './env.js';
import { economyTick } from './domain/realEstate.js';
import { SERVER } from '@jeu-ville/shared';

await runMigrations();
await seedReferenceData(db);

const { gameServer } = await buildServer(db, { clientOrigin: env.clientOrigin, staticDir: env.clientDist && resolve(env.clientDist) });

// Le monde tourne hors ligne : loyers et recettes des commerces, rattrapés à chaque tick.
const runEconomy = () => economyTick(db).catch((err) => console.error('economyTick', err));
await runEconomy();
setInterval(() => void runEconomy(), SERVER.economyTickMs);
await gameServer.listen(env.port);
console.log(`Serveur prêt sur le port ${env.port}${env.clientDist ? ' (jeu servi sur la même adresse)' : ''}`);
