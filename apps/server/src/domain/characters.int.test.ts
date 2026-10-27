/**
 * Tests d'intégration sur une vraie base PostgreSQL de TEST (vidée au lancement).
 * Ignorés si TEST_DATABASE_URL n'est pas défini (voir .env.example / docker-compose.yml).
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
    seedReferenceData: typeof import('../db/seed.js').seedReferenceData;
  };

  beforeAll(async () => {
    const client = await import('../db/client.js');
    const { runMigrations } = await import('../db/migrate.js');
    const { seedReferenceData } = await import('../db/seed.js');
    await runMigrations();
    await client.pool.query('truncate ledger_entries, characters, dwellings, players, districts, cities cascade');
    await seedReferenceData(client.db);
    mod = {
      db: client.db,
      pool: client.pool,
      seedReferenceData,
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

  it("reloge l'habitant d'un immeuble qui a disparu de la carte", async () => {
    const c = await mod.createCharacter(mod.db, await newPlayer(), look);
    // Simule un ancien immeuble : on déplace le perso dans un logement inconnu de la carte.
    await mod.pool.query(
      `insert into dwellings (id, district_id, building_id, building_name, kind, weekly_rent_cents)
       select 'old:1', district_id, 'ancien', 'Ancien immeuble', kind, weekly_rent_cents from dwellings limit 1`,
    );
    await mod.pool.query(`update dwellings set tenant_character_id = null where tenant_character_id = $1`, [c.id]);
    await mod.pool.query(`update dwellings set tenant_character_id = $1 where id = 'old:1'`, [c.id]);
    await mod.pool.query(`update characters set dwelling_id = 'old:1' where id = $1`, [c.id]);

    await mod.seedReferenceData(mod.db);

    const { rows } = await mod.pool.query(
      `select c.dwelling_id, d.building_id from characters c join dwellings d on d.id = c.dwelling_id where c.id = $1`,
      [c.id],
    );
    expect(rows[0]?.building_id).not.toBe('ancien');
    const old = await mod.pool.query(`select 1 from dwellings where id = 'old:1'`);
    expect(old.rowCount).toBe(0);
  });
});
