/** Missions du quotidien sur base réelle (TEST_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ECONOMY, ERRANDS, ERRAND_TYPES, type ErrandOffer } from '@jeu-ville/shared';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('missions du quotidien (base réelle)', () => {
  let mod: typeof import('./errands.js') & typeof import('./characters.js') & typeof import('./auth.js') & {
    db: typeof import('../db/client.js').db;
    pool: typeof import('../db/client.js').pool;
  };
  const look = { sex: 'male', baseLook: 0, skinTone: 2, hairColor: 0, bodyType: 1 } as const;

  beforeAll(async () => {
    const client = await import('../db/client.js');
    const { runMigrations } = await import('../db/migrate.js');
    const { seedReferenceData } = await import('../db/seed.js');
    await runMigrations();
    await seedReferenceData(client.db);
    mod = { ...(await import('./errands.js')), ...(await import('./characters.js')), ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const newCharacter = async () => {
    const s = await mod.createSession(mod.db, `c_${randomUUID().slice(0, 12)}`);
    return mod.createCharacter(mod.db, { id: s.playerId, pseudo: s.pseudo }, look);
  };

  const offer = (n: number, type: ErrandOffer['type'] = 'wallet'): ErrandOffer => ({
    id: `test-${randomUUID().slice(0, 8)}:${n}`,
    type,
    giver: { x: 1, y: 1, name: 'Sonia', sex: 'female', baseLook: 0, skinTone: 0, hairColor: 0 },
    spot: { x: 5, y: 5 },
  });

  it('récompense une seule fois par demande, argent au journal et bonté', async () => {
    const c = await newCharacter();
    const o = offer(0);
    const first = await mod.completeErrand(mod.db, c.id, c.districtId, o);
    const again = await mod.completeErrand(mod.db, c.id, c.districtId, o);
    expect(first.moneyCents).toBe(ECONOMY.startingMoneyCents + ERRAND_TYPES.wallet.rewardCents);
    expect(again.moneyCents).toBe(first.moneyCents);
    expect(first.errandsDoneToday).toEqual([o.id]);
    expect(first.happinessBonus).toBeGreaterThan(c.happinessBonus);
    await expect(mod.checkErrandAllowed(mod.db, c.id, c.districtId, o.id)).rejects.toThrow(/déjà aidé/);
  });

  it('limite de missions par jour', async () => {
    const c = await newCharacter();
    for (let n = 0; n < ERRANDS.perDay; n++) await mod.completeErrand(mod.db, c.id, c.districtId, offer(n, 'groceries'));
    await expect(mod.checkErrandAllowed(mod.db, c.id, c.districtId, 'autre:0')).rejects.toThrow(/reviens demain/);
  });
});
