/**
 * Missions du quotidien : combien en a fait le joueur aujourd'hui, et
 * récompense d'une mission réussie (argent au journal, bonté), une seule fois
 * par demande grâce à l'index unique d'errands_done et à la clé d'idempotence.
 */
import { and, count, eq } from 'drizzle-orm';
import { ERRANDS, addKindness, errandReward, realDayKey, type CharacterSelf, type ErrandOffer } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { characters, errandsDone } from '../db/schema.js';
import { selfOf } from './characters.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

export async function errandsDoneCount(db: Db, characterId: string, nowMs = Date.now()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(errandsDone)
    .where(and(eq(errandsDone.characterId, characterId), eq(errandsDone.day, realDayKey(nowMs))));
  return Number(row?.n ?? 0);
}

/** Peut-on accepter cette demande ? (pas déjà faite, limite du jour non atteinte) */
export async function checkErrandAllowed(db: Db, characterId: string, districtId: string, offerId: string, nowMs = Date.now()): Promise<void> {
  const [done] = await db
    .select({ offerId: errandsDone.offerId })
    .from(errandsDone)
    .where(and(eq(errandsDone.characterId, characterId), eq(errandsDone.districtId, districtId), eq(errandsDone.offerId, offerId)));
  if (done) throw new GameError('Tu as déjà aidé cette personne aujourd’hui.');
  if ((await errandsDoneCount(db, characterId, nowMs)) >= ERRANDS.perDay) {
    throw new GameError('Tu as déjà beaucoup aidé aujourd’hui : reviens demain !');
  }
}

/** Mission réussie : récompense (une seule fois), puis vue privée à jour. */
export async function completeErrand(db: Db, characterId: string, districtId: string, offer: ErrandOffer, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
    if (!row) throw new GameError('Personnage introuvable.', 404);
    const inserted = await tx
      .insert(errandsDone)
      .values({ characterId, districtId, offerId: offer.id, day: realDayKey(nowMs), type: offer.type, completedAt: new Date(nowMs) })
      .onConflictDoNothing()
      .returning({ offerId: errandsDone.offerId });
    if (inserted.length > 0) {
      const reward = errandReward(offer.type);
      if (reward.cents > 0) {
        await recordLedgerEntry(tx, {
          characterId,
          amountCents: reward.cents,
          reason: `errand:${offer.type}`,
          idempotencyKey: `errand:${characterId}:${districtId}:${offer.id}`,
        });
      }
      const kindness = addKindness(row.kindness, row.kindnessUpdatedAt.getTime(), nowMs, reward.kindness);
      await tx.update(characters).set({ kindness, kindnessUpdatedAt: new Date(nowMs) }).where(eq(characters.id, characterId));
    }
    const [fresh] = await tx.select().from(characters).where(eq(characters.id, characterId));
    return selfOf(tx, fresh!, nowMs);
  });
}
