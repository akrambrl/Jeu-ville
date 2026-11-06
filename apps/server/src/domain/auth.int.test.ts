/** Sessions par pseudo, sur base réelle (TEST_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('sessions (base réelle)', () => {
  let mod: typeof import('./auth.js') & { db: typeof import('../db/client.js').db; pool: typeof import('../db/client.js').pool };

  beforeAll(async () => {
    const client = await import('../db/client.js');
    mod = { ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  it('crée une session et retrouve le joueur depuis son jeton', async () => {
    const pseudo = `p_${randomUUID().slice(0, 8)}`;
    const s = await mod.createSession(mod.db, pseudo);
    expect(await mod.playerFromToken(mod.db, s.token)).toEqual({ id: s.playerId, pseudo });
    expect(await mod.playerFromToken(mod.db, 'faux')).toBeNull();
  });

  it('refuse un pseudo déjà pris, sans tenir compte des majuscules', async () => {
    const pseudo = `P_${randomUUID().slice(0, 8)}`;
    await mod.createSession(mod.db, pseudo);
    await expect(mod.createSession(mod.db, pseudo.toLowerCase())).rejects.toThrow(/déjà pris/);
  });
});
