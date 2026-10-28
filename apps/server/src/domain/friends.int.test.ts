/** Amis (demandes, acceptation, blocage) sur base réelle (TEST_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('amis (base réelle)', () => {
  let mod: typeof import('./friends.js') & typeof import('./chat.js') & typeof import('./characters.js') & typeof import('./auth.js') & {
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
    mod = { ...(await import('./friends.js')), ...(await import('./chat.js')), ...(await import('./characters.js')), ...(await import('./auth.js')), db: client.db, pool: client.pool };
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  const newCharacter = async () => {
    const s = await mod.createSession(mod.db, `c_${randomUUID().slice(0, 12)}`);
    return mod.createCharacter(mod.db, { id: s.playerId, pseudo: s.pseudo }, look);
  };

  it('demande, acceptation, puis retrait', async () => {
    const [a, b] = [await newCharacter(), await newCharacter()];
    expect(await mod.requestFriend(mod.db, a.id, b.id)).toBe('pending');
    await expect(mod.requestFriend(mod.db, a.id, b.id)).rejects.toThrow(/déjà envoyée/);
    expect((await mod.listFriendships(mod.db, b.id)).map((f) => [f.name, f.status, f.mine])).toEqual([[a.name, 'pending', false]]);
    await mod.respondFriend(mod.db, b.id, a.id, true);
    expect(await mod.friendIds(mod.db, a.id)).toEqual([b.id]);
    await expect(mod.requestFriend(mod.db, b.id, a.id)).rejects.toThrow(/déjà amis/);
    await mod.removeFriend(mod.db, b.id, a.id);
    expect(await mod.friendIds(mod.db, a.id)).toEqual([]);
  });

  it('deux demandes croisées font une amitié, pas un doublon', async () => {
    const [a, b] = [await newCharacter(), await newCharacter()];
    await mod.requestFriend(mod.db, a.id, b.id);
    expect(await mod.requestFriend(mod.db, b.id, a.id)).toBe('accepted');
    const { rows } = await mod.pool.query('select count(*)::int as n from friendships where (low_id = $1 or high_id = $1)', [a.id]);
    expect(rows[0].n).toBe(1);
  });

  it('on retrouve un joueur par son pseudo ; pas de demande si l’un a bloqué l’autre', async () => {
    const [a, b] = [await newCharacter(), await newCharacter()];
    expect((await mod.findCharacterByName(mod.db, b.name.toUpperCase()))?.characterId).toBe(b.id);
    await mod.setBlocked(mod.db, b.id, a.id, true);
    await expect(mod.requestFriend(mod.db, a.id, b.id)).rejects.toThrow(/Impossible/);
    await expect(mod.requestFriend(mod.db, a.id, a.id)).rejects.toThrow(/toi-même/);
  });
});
