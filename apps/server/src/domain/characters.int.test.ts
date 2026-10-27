/**
 * Tests d'intégration sur une vraie base PostgreSQL.
 * Ignorés si DATABASE_URL n'est pas défini (voir .env.example / docker-compose.yml).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ECONOMY,
  HOME_ACTIONS,
  REAL_MS_PER_HOUR,
  STARTING_GAUGES,
  applyGaugeEffects,
  decayGauges,
} from '@jeu-ville/shared';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('personnages (base réelle)', () => {
  let mod: {
    db: typeof import('../db/client.js').db;
    pool: typeof import('../db/client.js').pool;
    createSession: typeof import('./auth.js').createSession;
    createCharacter: typeof import('./characters.js').createCharacter;
    performHomeAction: typeof import('./characters.js').performHomeAction;
    ledgerBalance: typeof import('./characters.js').ledgerBalance;
  };

  beforeAll(async () => {
    const client = await import('../db/client.js');
    const { runMigrations } = await import('../db/migrate.js');
    const { seedReferenceData } = await import('../db/seed.js');
    await runMigrations();
    await seedReferenceData(client.db);
    mod = {
      db: client.db,
      pool: client.pool,
      ...(await import('./auth.js')),
      ...(await import('./characters.js')),
    };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const look = { sex: 'female', baseLook: 0, skinTone: 0, hairColor: 0, bodyType: 1 } as const;
  const newPlayer = async () => {
    const s = await mod.createSession(mod.db, `t_${randomUUID().slice(0, 12)}`);
    return { id: s.playerId, pseudo: s.pseudo };
  };

  it('verse le capital de départ et le trace dans le journal', async () => {
    const c = await mod.createCharacter(mod.db, await newPlayer(), look);
    expect(c.moneyCents).toBe(ECONOMY.startingMoneyCents);
    expect(await mod.ledgerBalance(mod.db, c.id)).toBe(ECONOMY.startingMoneyCents);
    expect(c.home).not.toBeNull();
  });

  it("n'attribue jamais le même appart à deux créations simultanées", async () => {
    const players = await Promise.all(Array.from({ length: 20 }, newPlayer));
    const created = await Promise.all(players.map((p) => mod.createCharacter(mod.db, p, look)));
    const dwellingIds = created.map((c) => c.home!.dwellingId);
    expect(new Set(dwellingIds).size).toBe(created.length);
  });

  it('refuse un second personnage pour le même joueur', async () => {
    const p = await newPlayer();
    await mod.createCharacter(mod.db, p, look);
    await expect(mod.createCharacter(mod.db, p, look)).rejects.toThrow(/déjà un personnage/);
  });

  it('manger débite le prix, remonte la faim, et le solde reste égal au journal', async () => {
    const c = await mod.createCharacter(mod.db, await newPlayer(), look);
    const elapsed = 10 * REAL_MS_PER_HOUR;
    const after = await mod.performHomeAction(mod.db, c.id, 'eat', c.computedAt + elapsed);
    expect(after.moneyCents).toBe(ECONOMY.startingMoneyCents - HOME_ACTIONS.eat.costCents);
    const expected = applyGaugeEffects(decayGauges(STARTING_GAUGES, elapsed), HOME_ACTIONS.eat.effects);
    expect(after.gauges.hunger).toBeCloseTo(expected.hunger, 3);
    expect(await mod.ledgerBalance(mod.db, c.id)).toBe(after.moneyCents);
  });

  it('les actions simultanées ne perdent aucun débit', async () => {
    const c = await mod.createCharacter(mod.db, await newPlayer(), look);
    await Promise.all(Array.from({ length: 10 }, () => mod.performHomeAction(mod.db, c.id, 'eat')));
    const balance = await mod.ledgerBalance(mod.db, c.id);
    expect(balance).toBe(ECONOMY.startingMoneyCents - 10 * HOME_ACTIONS.eat.costCents);
  });
});
