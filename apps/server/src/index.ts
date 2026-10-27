import { db } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedReferenceData } from './db/seed.js';
import { buildServer } from './app.js';
import { env } from './env.js';

await runMigrations();
await seedReferenceData(db);

const { gameServer } = await buildServer(db, { clientOrigin: env.clientOrigin });
await gameServer.listen(env.port);
console.log(`Serveur prêt sur http://localhost:${env.port}`);
