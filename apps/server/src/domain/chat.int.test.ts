/** Chat (blocage, signalements) sur base réelle (TEST_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatLine } from '@jeu-ville/shared';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('chat (base réelle)', () => {
  let mod: typeof import('./chat.js') & typeof import('./characters.js') & typeof import('./auth.js') & {
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
    mod = { ...(await import('./chat.js')), ...(await import('./characters.js')), ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const newCharacter = async () => {
    const s = await mod.createSession(mod.db, `c_${randomUUID().slice(0, 12)}`);
    return mod.createCharacter(mod.db, { id: s.playerId, pseudo: s.pseudo }, look);
  };

  it('bloquer puis débloquer un joueur', async () => {
    const [a, b] = [await newCharacter(), await newCharacter()];
    expect(await mod.setBlocked(mod.db, a.id, b.id, true)).toEqual([b.id]);
    expect(await mod.setBlocked(mod.db, a.id, b.id, true)).toEqual([b.id]);
    expect(await mod.listBlocked(mod.db, a.id)).toEqual([b.id]);
    expect(await mod.setBlocked(mod.db, a.id, b.id, false)).toEqual([]);
    await expect(mod.setBlocked(mod.db, a.id, a.id, true)).rejects.toThrow(/toi-même/);
  });

  it('un signalement par message et par joueur, copie du texte gardée', async () => {
    const [a, b] = [await newCharacter(), await newCharacter()];
    const line: ChatLine = { id: randomUUID(), characterId: b.id, name: b.name, districtId: b.districtId, text: 'message', at: Date.now() };
    expect(await mod.reportLine(mod.db, a.id, line)).toBe(true);
    expect(await mod.reportLine(mod.db, a.id, line)).toBe(false);
    const { rows } = await mod.pool.query('select message_text, status from chat_reports where message_id = $1', [line.id]);
    expect(rows).toEqual([{ message_text: 'message', status: 'open' }]);
    await expect(mod.reportLine(mod.db, b.id, line)).rejects.toThrow(/propre message/);
  });
});
