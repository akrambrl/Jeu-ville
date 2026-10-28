/** Agence pour l'emploi sur base réelle (TEST_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DISTRICT_KEY, ECONOMY, JOBS, employers, getDistrictMap } from '@jeu-ville/shared';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('agence pour l’emploi (base réelle)', () => {
  let mod: typeof import('./jobs.js') & typeof import('./characters.js') & typeof import('./auth.js') & {
    db: typeof import('../db/client.js').db;
    pool: typeof import('../db/client.js').pool;
  };
  const courierJob = employers(getDistrictMap(DEFAULT_DISTRICT_KEY)!).find((e) => e.jobType === 'courier')!;
  const look = { sex: 'female', baseLook: 1, skinTone: 0, hairColor: 0, bodyType: 1 } as const;

  beforeAll(async () => {
    const client = await import('../db/client.js');
    const { runMigrations } = await import('../db/migrate.js');
    const { seedReferenceData } = await import('../db/seed.js');
    await runMigrations();
    await seedReferenceData(client.db);
    mod = { ...(await import('./jobs.js')), ...(await import('./characters.js')), ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const newCharacter = async () => {
    const s = await mod.createSession(mod.db, `j_${randomUUID().slice(0, 12)}`);
    return mod.createCharacter(mod.db, { id: s.playerId, pseudo: s.pseudo }, look);
  };

  it('il faut une tenue correcte pour être embauché', async () => {
    const c = await newCharacter();
    await mod.pool.query('update characters set appearance = 10 where id = $1', [c.id]);
    await expect(mod.applyJob(mod.db, c.id, DEFAULT_DISTRICT_KEY, courierJob.id)).rejects.toThrow(/présente-toi mieux/);
  });

  it('embauché, payé une seule fois par mission, et l’expérience monte', async () => {
    const c = await newCharacter();
    const hired = await mod.applyJob(mod.db, c.id, DEFAULT_DISTRICT_KEY, courierJob.id);
    expect(hired.job?.jobType).toBe('courier');
    await expect(mod.applyJob(mod.db, c.id, DEFAULT_DISTRICT_KEY, courierJob.id)).rejects.toThrow(/déjà un emploi/);
    await mod.payMission(mod.db, c.id, 'courier', 1200, 'shift-a:0');
    await expect(mod.payMission(mod.db, c.id, 'courier', 1200, 'shift-a:0')).rejects.toThrow();
    const after = await mod.payMission(mod.db, c.id, 'courier', 1200, 'shift-a:1');
    expect(after.moneyCents).toBe(ECONOMY.startingMoneyCents + 2400);
    expect(after.jobXp.courier).toBe(2 * JOBS.courier.xpPerMission);
    const quit = await mod.quitJob(mod.db, c.id);
    expect(quit.job).toBeNull();
    expect(quit.jobXp.courier).toBe(2 * JOBS.courier.xpPerMission);
  });
});
