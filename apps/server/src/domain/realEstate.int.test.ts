/**
 * Agence immobilière sur base réelle (TEST_DATABASE_URL, vidée au lancement par
 * characters.int.test.ts ; ici on ne crée que des persos neufs).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPES,
  DEFAULT_DISTRICT_KEY,
  ECONOMY,
  REAL_MS_PER_HOUR,
  businessPayoutCents,
  getDistrictMap,
  rentPerPeriodCents,
  salePriceCents,
} from '@jeu-ville/shared';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('agence immobilière (base réelle)', () => {
  let mod: typeof import('./realEstate.js') & typeof import('./characters.js') & typeof import('./auth.js') & { db: typeof import('../db/client.js').db; pool: typeof import('../db/client.js').pool };
  const map = getDistrictMap(DEFAULT_DISTRICT_KEY)!;
  const key = DEFAULT_DISTRICT_KEY;
  const look = { sex: 'male', baseLook: 0, skinTone: 0, hairColor: 0, bodyType: 1 } as const;
  const used = new Set<string>();
  /** Un bien différent par test (la base n'est pas vidée entre deux tests). */
  const nextSpot = (kind: 'apartment' | 'house' | 'local', maxPrice = Infinity) => {
    const spot = map.properties.find((p) => p.kind === kind && !used.has(p.id) && salePriceCents(p) <= maxPrice)!;
    used.add(spot.id);
    return spot;
  };

  beforeAll(async () => {
    const client = await import('../db/client.js');
    const { runMigrations } = await import('../db/migrate.js');
    const { seedReferenceData } = await import('../db/seed.js');
    await runMigrations();
    await seedReferenceData(client.db);
    mod = { ...(await import('./realEstate.js')), ...(await import('./characters.js')), ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const newCharacter = async () => {
    const s = await mod.createSession(mod.db, `r_${randomUUID().slice(0, 12)}`);
    return mod.createCharacter(mod.db, { id: s.playerId, pseudo: s.pseudo }, look);
  };

  it('deux joueurs, un local : le premier gagne, le second est prévenu', async () => {
    const [a, b] = await Promise.all([newCharacter(), newCharacter()]);
    const spot = nextSpot('local', ECONOMY.startingMoneyCents);
    const results = await Promise.allSettled([
      mod.acquireProperty(mod.db, a.id, key, spot.id, 'buy', randomUUID()),
      mod.acquireProperty(mod.db, b.id, key, spot.id, 'buy', randomUUID()),
    ]);
    expect(results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok')).sort()).toEqual(['GameError: Ce bien vient d’être acheté.', 'ok']);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(loser.reason)).toMatch(/vient d’être acheté/);
    expect((await mod.ledgerBalance(mod.db, a.id)) + (await mod.ledgerBalance(mod.db, b.id))).toBe(2 * ECONOMY.startingMoneyCents - salePriceCents(spot));
  });

  it('un double clic (même demande) ne paie qu’une fois', async () => {
    const c = await newCharacter();
    const spot = nextSpot('apartment');
    const requestId = randomUUID();
    await mod.acquireProperty(mod.db, c.id, key, spot.id, 'rent', requestId);
    const again = await mod.acquireProperty(mod.db, c.id, key, spot.id, 'rent', requestId);
    expect(again.moneyCents).toBe(ECONOMY.startingMoneyCents - rentPerPeriodCents(spot));
    expect(again.home?.door).toEqual(spot.door);
  });

  it('les loyers sont rattrapés après une absence, sans double prélèvement', async () => {
    const c = await newCharacter();
    const spot = nextSpot('apartment');
    const start = Date.now();
    await mod.acquireProperty(mod.db, c.id, key, spot.id, 'rent', randomUUID(), start);
    const later = start + 2.5 * 24 * REAL_MS_PER_HOUR;
    await mod.economyTick(mod.db, later);
    await mod.economyTick(mod.db, later);
    expect(await mod.ledgerBalance(mod.db, c.id)).toBe(ECONOMY.startingMoneyCents - 3 * rentPerPeriodCents(spot));
  });

  it('sans argent pour le loyer, le bail s’arrête et on retrouve un appart de départ', async () => {
    const c = await newCharacter();
    const spot = nextSpot('house');
    await mod.acquireProperty(mod.db, c.id, key, spot.id, 'rent', randomUUID());
    await mod.pool.query('update characters set money_cents = 0 where id = $1', [c.id]);
    await mod.economyTick(mod.db, Date.now() + 1.1 * 24 * REAL_MS_PER_HOUR);
    const self = await mod.getCharacterSelf(mod.db, c.id);
    expect(self!.properties).toHaveLength(0);
    expect(self!.home?.door).not.toEqual(spot.door);
  });

  it('un commerce ouvert rapporte chaque heure à son propriétaire', async () => {
    const c = await newCharacter();
    const spot = nextSpot('local');
    await mod.acquireProperty(mod.db, c.id, key, spot.id, 'rent', randomUUID());
    const opened = Date.now();
    await mod.openBusiness(mod.db, c.id, key, spot.id, 'barber', 'Chez Akram', opened);
    await expect(mod.openBusiness(mod.db, c.id, key, spot.id, 'snack', 'Encore')).rejects.toThrow(/déjà ouvert/);
    await mod.economyTick(mod.db, opened + 3.5 * REAL_MS_PER_HOUR);
    const expected =
      ECONOMY.startingMoneyCents - rentPerPeriodCents(spot) - BUSINESS_TYPES.barber.setupCents + 3 * businessPayoutCents('barber', spot);
    expect(await mod.ledgerBalance(mod.db, c.id)).toBe(expected);
    await expect(mod.openBusiness(mod.db, c.id, key, nextSpot('local').id, 'snack', 'Nique')).rejects.toThrow(/pas autorisé/);
  });

  it('carte régénérée : un bien acheté qui n’existe plus est remboursé une fois', async () => {
    const c = await newCharacter();
    const spot = nextSpot('local', ECONOMY.startingMoneyCents);
    await mod.acquireProperty(mod.db, c.id, DEFAULT_DISTRICT_KEY, spot.id, 'buy', randomUUID());
    // Simule une nouvelle carte où ce bien a disparu : on renomme son emplacement.
    await mod.pool.query('update properties set spot_id = $1 where id = $2', ['disparu-1', `${DEFAULT_DISTRICT_KEY}:${spot.id}`]);
    await mod.pool.query('update ledger_entries set reason = $1 where character_id = $2 and reason = $3', ['property_buy:disparu-1', c.id, `property_buy:${spot.id}`]);
    const { seedReferenceData } = await import('../db/seed.js');
    await seedReferenceData(mod.db);
    await seedReferenceData(mod.db);
    const self = (await mod.getCharacterSelf(mod.db, c.id))!;
    expect(self.moneyCents).toBe(ECONOMY.startingMoneyCents);
    expect(self.properties).toEqual([]);
    expect(await mod.ledgerBalance(mod.db, c.id)).toBe(self.moneyCents);
  });

  it('un déménagement toutes les deux semaines au plus', async () => {
    const c = await newCharacter();
    await mod.acquireProperty(mod.db, c.id, key, nextSpot('apartment').id, 'rent', randomUUID());
    const self = await mod.getCharacterSelf(mod.db, c.id);
    await mod.releaseProperty(mod.db, c.id, key, self!.properties[0]!.spotId);
    const second = nextSpot('apartment');
    const after = await mod.acquireProperty(mod.db, c.id, key, second.id, 'rent', randomUUID());
    // Loué, mais on ne peut pas encore y emménager.
    expect(after.home?.door).not.toEqual(second.door);
    await expect(mod.moveIn(mod.db, c.id, key, second.id)).rejects.toThrow(/déménagement/);
  });
});
