/**
 * Commerces de bouche des joueurs : un client (joueur) qui y mange paie le
 * joueur qui tient le commerce (deux écritures au journal, même transaction),
 * et le commerçant qui sert lui-même au comptoir encaisse chaque client servi.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { nextReputation, resolveFood, type CharacterSelf, type FoodPlaceKind } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { characters, properties } from '../db/schema.js';
import { selfOf, storedGauges } from './characters.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

/** Qui tient le commerce de ce local (propriétaire, sinon locataire), ou null s'il n'y en a pas. */
export async function businessOperator(
  db: Db,
  districtKey: string,
  spotId: string,
): Promise<{ characterId: string; type: string; name: string } | null> {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.districtId, districtKey), eq(properties.spotId, spotId), isNotNull(properties.businessType)));
  const operator = row?.ownerCharacterId ?? row?.tenantCharacterId;
  return row && operator ? { characterId: operator, type: row.businessType!, name: row.businessName ?? '' } : null;
}

/**
 * Manger dans le commerce d'un joueur : le prix lui est versé (gratuit pour le
 * commerçant lui-même). Renvoie la vue du client, le commerçant et la somme versée.
 */
export async function buyFoodAtBusiness(
  db: Db,
  buyerId: string,
  districtKey: string,
  spotId: string,
  kind: FoodPlaceKind,
  itemId: string,
  nowMs = Date.now(),
): Promise<{ self: CharacterSelf; operatorId: string; paidCents: number }> {
  const operator = await businessOperator(db, districtKey, spotId);
  if (!operator) throw new GameError('Ce commerce vient de fermer.');
  return db.transaction(async (tx) => {
    // Verrous toujours dans le même ordre (identifiants triés) : pas d'interblocage.
    const ids = [...new Set([buyerId, operator.characterId])].sort();
    for (const id of ids) await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, id)).for('update');
    const [row] = await tx.select().from(characters).where(eq(characters.id, buyerId));
    if (!row) throw new GameError('Personnage introuvable.', 404);
    const own = operator.characterId === buyerId;
    let paidCents = 0;
    const result = resolveFood(kind, itemId, storedGauges(row), row.gaugesUpdatedAt.getTime(), own ? Number.MAX_SAFE_INTEGER : row.moneyCents, nowMs);
    if (!result.ok) throw new GameError(result.error);
    if (!own) {
      const price = -result.moneyDeltaCents;
      paidCents = price;
      await recordLedgerEntry(tx, { characterId: buyerId, amountCents: -price, reason: `food:${kind}:${itemId}` });
      await recordLedgerEntry(tx, { characterId: operator.characterId, amountCents: price, reason: `business_sale:${spotId}` });
    }
    const [updated] = await tx
      .update(characters)
      .set({ ...result.gauges, gaugesUpdatedAt: new Date(nowMs) })
      .where(eq(characters.id, buyerId))
      .returning();
    return { self: await selfOf(tx, updated!, nowMs), operatorId: operator.characterId, paidCents };
  });
}

/**
 * Client servi à son propre comptoir : encaissé une seule fois par client (clé
 * de mission). Un plat cuisiné (`stars`) fait aussi évoluer la réputation du
 * commerce, dans la même transaction (donc une seule fois, elle aussi).
 */
export async function payCounterSale(
  db: Db,
  characterId: string,
  districtKey: string,
  spotId: string,
  amountCents: number,
  missionKey: string,
  stars?: 1 | 2 | 3,
): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).for('update');
    if (stars) {
      const where = and(eq(properties.districtId, districtKey), eq(properties.spotId, spotId), isNotNull(properties.businessType));
      const [prop] = await tx.select({ reputation: properties.businessReputation }).from(properties).where(where).for('update');
      if (prop) await tx.update(properties).set({ businessReputation: nextReputation(prop.reputation, stars) }).where(where);
    }
    await recordLedgerEntry(tx, {
      characterId,
      amountCents,
      reason: `business_counter:${spotId}`,
      idempotencyKey: `counter:${missionKey}`,
    });
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId));
    return selfOf(tx, row!, Date.now());
  });
}
