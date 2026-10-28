/**
 * Amis : demandes, acceptation, retrait. Une seule ligne par paire de joueurs
 * (index unique) : deux demandes croisées deviennent une amitié, jamais un doublon.
 * La présence (qui est connecté) est suivie par la room du chat.
 */
import { and, count, eq, or, sql } from 'drizzle-orm';
import { FRIENDS, type FriendRef } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { characters, chatBlocks, friendships } from '../db/schema.js';
import { GameError } from './errors.js';

const pair = (a: string, b: string) => (a < b ? { lowId: a, highId: b } : { lowId: b, highId: a });
const samePair = (a: string, b: string) => {
  const p = pair(a, b);
  return and(eq(friendships.lowId, p.lowId), eq(friendships.highId, p.highId));
};

export interface FriendRow extends FriendRef {
  districtId: string;
  status: 'pending' | 'accepted';
  /** La demande vient-elle de moi ? */
  mine: boolean;
}

/** Toutes mes relations (amis et demandes), avec le nom et le quartier de l'autre. */
export async function listFriendships(db: Db, me: string): Promise<FriendRow[]> {
  const other = sql<string>`case when ${friendships.lowId} = ${me} then ${friendships.highId} else ${friendships.lowId} end`;
  const rows = await db
    .select({ characterId: characters.id, name: characters.name, districtId: characters.districtId, status: friendships.status, requestedBy: friendships.requestedBy })
    .from(friendships)
    .innerJoin(characters, eq(characters.id, other))
    .where(or(eq(friendships.lowId, me), eq(friendships.highId, me)))
    .orderBy(characters.name);
  return rows.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    districtId: r.districtId,
    status: r.status as FriendRow['status'],
    mine: r.requestedBy === me,
  }));
}

/** Identifiants de mes amis (acceptés). */
export async function friendIds(db: Db, me: string): Promise<string[]> {
  return (await listFriendships(db, me)).filter((f) => f.status === 'accepted').map((f) => f.characterId);
}

export async function findCharacterByName(db: Db, name: string): Promise<FriendRef | null> {
  const [row] = await db
    .select({ characterId: characters.id, name: characters.name })
    .from(characters)
    .where(sql`lower(${characters.name}) = lower(${name.trim()})`);
  return row ?? null;
}

async function isBlockedEitherWay(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: chatBlocks.blockerId })
    .from(chatBlocks)
    .where(or(and(eq(chatBlocks.blockerId, a), eq(chatBlocks.blockedId, b)), and(eq(chatBlocks.blockerId, b), eq(chatBlocks.blockedId, a))));
  return !!row;
}

/**
 * Demande d'ami. Si l'autre m'avait déjà fait une demande, nous devenons amis.
 * Renvoie l'état obtenu.
 */
export async function requestFriend(db: Db, me: string, target: string): Promise<'pending' | 'accepted'> {
  if (me === target) throw new GameError('Tu ne peux pas t’ajouter toi-même.');
  if (await isBlockedEitherWay(db, me, target)) throw new GameError('Impossible d’ajouter ce joueur.');
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(friendships).where(samePair(me, target)).for('update');
    if (existing?.status === 'accepted') throw new GameError('Vous êtes déjà amis.');
    if (existing && existing.requestedBy === me) throw new GameError('Ta demande est déjà envoyée.');
    if (existing) {
      await tx.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(samePair(me, target));
      return 'accepted';
    }
    const mineOrTheirs = or(eq(friendships.lowId, me), eq(friendships.highId, me));
    const [{ n: friendsCount }] = (await tx
      .select({ n: count() })
      .from(friendships)
      .where(and(mineOrTheirs, eq(friendships.status, 'accepted')))) as [{ n: number }];
    if (friendsCount >= FRIENDS.max) throw new GameError('Tu as déjà le nombre maximum d’amis.');
    const [{ n: pending }] = (await tx
      .select({ n: count() })
      .from(friendships)
      .where(and(eq(friendships.requestedBy, me), eq(friendships.status, 'pending')))) as [{ n: number }];
    if (pending >= FRIENDS.maxPendingSent) throw new GameError('Trop de demandes en attente : attends des réponses.');
    const inserted = await tx
      .insert(friendships)
      .values({ ...pair(me, target), requestedBy: me, status: 'pending' })
      .onConflictDoNothing()
      .returning({ status: friendships.status });
    // Demande croisée au même instant : l'autre ligne a gagné, on l'accepte.
    if (inserted.length === 0) {
      await tx.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(samePair(me, target));
      return 'accepted';
    }
    return 'pending';
  });
}

/** Répondre à une demande reçue de `from`. */
export async function respondFriend(db: Db, me: string, from: string, accept: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(friendships).where(samePair(me, from)).for('update');
    if (!row || row.status !== 'pending' || row.requestedBy !== from) throw new GameError('Cette demande n’existe plus.');
    if (accept) await tx.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(samePair(me, from));
    else await tx.delete(friendships).where(samePair(me, from));
  });
}

/** Retirer un ami, ou annuler une demande envoyée. */
export async function removeFriend(db: Db, me: string, other: string): Promise<void> {
  await db.delete(friendships).where(samePair(me, other));
}
