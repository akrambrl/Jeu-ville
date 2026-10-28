/**
 * Agence immobilière (une par ville, tenue par un bot) : acheter ou louer un
 * logement ou un local, emménager, rendre ou revendre, ouvrir un commerce.
 *
 * Biens rares : chaque opération verrouille la ligne du bien (SELECT … FOR UPDATE)
 * dans une transaction ; le premier arrivé l'emporte, le second reçoit « ce bien
 * vient d'être pris ». Tout l'argent passe par le journal, avec clé d'idempotence.
 */
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  BUSINESS_TYPES,
  REAL_ESTATE,
  businessPayoutCents,
  canMove,
  containsBannedWord,
  getDistrictMap,
  payoutPeriodsDue,
  rentPerPeriodCents,
  rentPeriodsDue,
  salePriceCents,
  type BusinessType,
  type CharacterSelf,
  type PropertySpot,
} from '@jeu-ville/shared';
import type { Db, Tx } from '../db/client.js';
import { characters, dwellings, ledgerEntries, properties } from '../db/schema.js';
import { STARTER_DWELLING_KIND } from '../db/seed.js';
import { selfOf } from './characters.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

const HOME_KINDS = new Set<PropertySpot['kind']>(['apartment', 'house']);

export const propertyKey = (districtKey: string, spotId: string) => `${districtKey}:${spotId}`;

export function spotOf(districtKey: string, spotId: string): PropertySpot {
  const spot = getDistrictMap(districtKey)?.properties.find((p) => p.id === spotId);
  if (!spot) throw new GameError('Ce bien n’existe pas.');
  return spot;
}

async function lockCharacter(tx: Tx, characterId: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
  if (!row) throw new GameError('Personnage introuvable.', 404);
  return row;
}

async function lockProperty(tx: Tx, id: string) {
  const [row] = await tx.select().from(properties).where(eq(properties.id, id)).for('update');
  if (!row) throw new GameError('Ce bien n’existe pas.');
  return row;
}

async function reload(tx: Tx, characterId: string): Promise<CharacterSelf> {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId));
  return selfOf(tx, row!, Date.now());
}

/** Biens déjà pris par des joueurs dans le quartier. */
export async function takenSpots(db: Db, districtKey: string): Promise<string[]> {
  const rows = await db
    .select({ spotId: properties.spotId })
    .from(properties)
    .where(and(eq(properties.districtId, districtKey), or(isNotNull(properties.ownerCharacterId), isNotNull(properties.tenantCharacterId))));
  return rows.map((r) => r.spotId);
}

/** Commerces ouverts par des joueurs (enseignes). */
export async function openBusinesses(db: Db, districtKey: string): Promise<{ spotId: string; type: string; name: string }[]> {
  const rows = await db
    .select({ spotId: properties.spotId, type: properties.businessType, name: properties.businessName })
    .from(properties)
    .where(and(eq(properties.districtId, districtKey), isNotNull(properties.businessType)));
  return rows.map((r) => ({ spotId: r.spotId, type: r.type!, name: r.name! }));
}

/** Le bien déjà traité pour cette demande (double clic, réseau) : rien à refaire. */
async function alreadyDone(tx: Tx, key: string): Promise<boolean> {
  const [hit] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, key));
  return !!hit;
}

/** Biens détenus (achetés ou loués) par le perso, par catégorie. */
async function holdings(tx: Tx, characterId: string) {
  const rows = await tx
    .select()
    .from(properties)
    .where(or(eq(properties.ownerCharacterId, characterId), eq(properties.tenantCharacterId, characterId)));
  return {
    homes: rows.filter((r) => HOME_KINDS.has(r.kind as PropertySpot['kind'])),
    locals: rows.filter((r) => r.kind === 'local'),
  };
}

/** Emménager dans un logement qu'on détient : on quitte l'appart de départ. */
async function moveInto(tx: Tx, characterId: string, propertyId: string, nowMs: number): Promise<void> {
  const row = await lockCharacter(tx, characterId);
  if (row.homePropertyId === propertyId) return;
  if (!canMove(row.movedAt?.getTime() ?? null, nowMs)) {
    throw new GameError(`Un déménagement toutes les ${REAL_ESTATE.moveCooldownDays / 7} semaines au plus.`);
  }
  if (row.dwellingId) await tx.update(dwellings).set({ tenantCharacterId: null }).where(eq(dwellings.id, row.dwellingId));
  await tx
    .update(characters)
    .set({ homePropertyId: propertyId, dwellingId: null, movedAt: new Date(nowMs) })
    .where(eq(characters.id, characterId));
}

/** Plus de logement à soi : retour dans un appart de départ libre du quartier. */
async function backToStarter(tx: Tx, characterId: string, districtKey: string): Promise<void> {
  const [fresh] = await tx
    .select()
    .from(dwellings)
    .where(and(eq(dwellings.districtId, districtKey), eq(dwellings.kind, STARTER_DWELLING_KIND), isNull(dwellings.tenantCharacterId)))
    .orderBy(sql`random()`)
    .limit(1)
    .for('update', { skipLocked: true });
  if (fresh) await tx.update(dwellings).set({ tenantCharacterId: characterId }).where(eq(dwellings.id, fresh.id));
  await tx.update(characters).set({ homePropertyId: null, dwellingId: fresh?.id ?? null }).where(eq(characters.id, characterId));
}

/** Acheter (`buy`) ou louer (`rent`) un bien libre. */
export async function acquireProperty(
  db: Db,
  characterId: string,
  districtKey: string,
  spotId: string,
  mode: 'buy' | 'rent',
  requestId: string,
  nowMs = Date.now(),
): Promise<CharacterSelf> {
  const spot = spotOf(districtKey, spotId);
  const id = propertyKey(districtKey, spotId);
  const key = `property:${mode}:${requestId}`;
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    if (await alreadyDone(tx, key)) return reload(tx, characterId);
    const prop = await lockProperty(tx, id);
    if (prop.ownerCharacterId || prop.tenantCharacterId) {
      throw new GameError(prop.ownerCharacterId ? 'Ce bien vient d’être acheté.' : 'Ce bien vient d’être loué.');
    }
    const held = await holdings(tx, characterId);
    if (HOME_KINDS.has(spot.kind) && held.homes.length >= REAL_ESTATE.maxHomes) {
      throw new GameError('Tu as déjà un logement : rends-le ou revends-le d’abord.');
    }
    if (spot.kind === 'local' && held.locals.length >= REAL_ESTATE.maxLocals) {
      throw new GameError(`${REAL_ESTATE.maxLocals} locaux au plus.`);
    }
    if (mode === 'buy') {
      const price = salePriceCents(spot);
      if (row.moneyCents < price) throw new GameError("Pas assez d'argent.");
      await recordLedgerEntry(tx, { characterId, amountCents: -price, reason: `property_buy:${spotId}`, idempotencyKey: key });
      await tx.update(properties).set({ ownerCharacterId: characterId }).where(eq(properties.id, id));
    } else {
      // Premier loyer payé à la signature.
      const rent = rentPerPeriodCents(spot);
      if (row.moneyCents < rent) throw new GameError("Pas assez d'argent.");
      await recordLedgerEntry(tx, { characterId, amountCents: -rent, reason: `rent:${spotId}`, idempotencyKey: key });
      await tx
        .update(properties)
        .set({ tenantCharacterId: characterId, leaseStartedAt: new Date(nowMs), rentPeriodsPaid: 1 })
        .where(eq(properties.id, id));
    }
    // Nouveau logement : on y emménage tout de suite si c'est permis.
    if (HOME_KINDS.has(spot.kind) && canMove(row.movedAt?.getTime() ?? null, nowMs)) await moveInto(tx, characterId, id, nowMs);
    return reload(tx, characterId);
  });
}

export async function moveIn(db: Db, characterId: string, districtKey: string, spotId: string, nowMs = Date.now()): Promise<CharacterSelf> {
  const spot = spotOf(districtKey, spotId);
  if (!HOME_KINDS.has(spot.kind)) throw new GameError('On ne peut pas habiter dans un local commercial.');
  const id = propertyKey(districtKey, spotId);
  return db.transaction(async (tx) => {
    const prop = await lockProperty(tx, id);
    if (prop.ownerCharacterId !== characterId && prop.tenantCharacterId !== characterId) throw new GameError('Ce logement n’est pas à toi.');
    await moveInto(tx, characterId, id, nowMs);
    return reload(tx, characterId);
  });
}

/** Rendre un bien loué, ou le revendre à l'agence ; le commerce éventuel ferme. */
export async function releaseProperty(db: Db, characterId: string, districtKey: string, spotId: string): Promise<CharacterSelf> {
  const spot = spotOf(districtKey, spotId);
  const id = propertyKey(districtKey, spotId);
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const prop = await lockProperty(tx, id);
    const owner = prop.ownerCharacterId === characterId;
    if (!owner && prop.tenantCharacterId !== characterId) throw new GameError('Ce bien n’est pas à toi.');
    if (owner) {
      const refund = Math.round(salePriceCents(spot) * REAL_ESTATE.resaleShare);
      await recordLedgerEntry(tx, { characterId, amountCents: refund, reason: `property_sell:${spotId}`, idempotencyKey: `property:sell:${id}:${characterId}:${Date.now()}` });
    }
    await tx
      .update(properties)
      .set({
        ownerCharacterId: null,
        tenantCharacterId: null,
        leaseStartedAt: null,
        rentPeriodsPaid: 0,
        businessType: null,
        businessName: null,
        businessOpenedAt: null,
        payoutPeriodsPaid: 0,
      })
      .where(eq(properties.id, id));
    if (row.homePropertyId === id) await backToStarter(tx, characterId, districtKey);
    return reload(tx, characterId);
  });
}

export async function openBusiness(
  db: Db,
  characterId: string,
  districtKey: string,
  spotId: string,
  type: BusinessType,
  name: string,
  nowMs = Date.now(),
): Promise<CharacterSelf> {
  const spot = spotOf(districtKey, spotId);
  if (spot.kind !== 'local') throw new GameError('Un commerce s’ouvre dans un local commercial.');
  if (containsBannedWord(name)) throw new GameError('Ce nom n’est pas autorisé.');
  const id = propertyKey(districtKey, spotId);
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const prop = await lockProperty(tx, id);
    if (prop.ownerCharacterId !== characterId && prop.tenantCharacterId !== characterId) throw new GameError('Ce local n’est pas à toi.');
    if (prop.businessType) throw new GameError('Un commerce est déjà ouvert ici.');
    const setup = BUSINESS_TYPES[type].setupCents;
    if (row.moneyCents < setup) throw new GameError("Pas assez d'argent pour les travaux.");
    await recordLedgerEntry(tx, { characterId, amountCents: -setup, reason: `business_setup:${type}`, idempotencyKey: `business:${id}:${nowMs}` });
    await tx
      .update(properties)
      .set({ businessType: type, businessName: name, businessOpenedAt: new Date(nowMs), payoutPeriodsPaid: 0 })
      .where(eq(properties.id, id));
    return reload(tx, characterId);
  });
}

/**
 * Tick d'économie (le monde tourne hors ligne) : loyers échus et recettes des
 * commerces. Rejouable : chaque période porte une clé d'idempotence, et les
 * compteurs de périodes payées sont mis à jour dans la même transaction.
 * Renvoie les persos concernés (pour rafraîchir ceux qui sont connectés).
 */
export async function economyTick(db: Db, nowMs = Date.now()): Promise<Set<string>> {
  const touched = new Set<string>();
  const active = await db
    .select({ id: properties.id })
    .from(properties)
    .where(or(isNotNull(properties.tenantCharacterId), isNotNull(properties.businessType)));
  for (const { id } of active) {
    await db.transaction(async (tx) => {
      const prop = await lockProperty(tx, id);
      const spot = getDistrictMap(prop.districtId)?.properties.find((p) => p.id === prop.spotId);
      if (!spot) return;

      // Loyer : une période par jour réel ; impayé = fin du bail.
      if (prop.tenantCharacterId && prop.leaseStartedAt) {
        const tenant = prop.tenantCharacterId;
        const due = rentPeriodsDue(prop.leaseStartedAt.getTime(), nowMs);
        let paid = prop.rentPeriodsPaid;
        const rent = rentPerPeriodCents(spot);
        for (; paid < due; paid++) {
          const key = `rent:${id}:${prop.leaseStartedAt.getTime()}:${paid + 1}`;
          const [me] = await tx.select().from(characters).where(eq(characters.id, tenant)).for('update');
          if (!me || me.moneyCents < rent) {
            await tx
              .update(properties)
              .set({ tenantCharacterId: null, leaseStartedAt: null, rentPeriodsPaid: 0, businessType: null, businessName: null, businessOpenedAt: null, payoutPeriodsPaid: 0 })
              .where(eq(properties.id, id));
            if (me?.homePropertyId === id) await backToStarter(tx, tenant, prop.districtId);
            touched.add(tenant);
            return;
          }
          await recordLedgerEntry(tx, { characterId: tenant, amountCents: -rent, reason: `rent:${prop.spotId}`, idempotencyKey: key });
          touched.add(tenant);
        }
        if (paid !== prop.rentPeriodsPaid) await tx.update(properties).set({ rentPeriodsPaid: paid }).where(eq(properties.id, id));
      }

      // Recettes du commerce, versées au propriétaire ou au locataire du local.
      const holder = prop.ownerCharacterId ?? prop.tenantCharacterId;
      if (holder && prop.businessType && prop.businessOpenedAt) {
        const due = payoutPeriodsDue(prop.businessOpenedAt.getTime(), nowMs);
        if (due > prop.payoutPeriodsPaid) {
          const amount = (due - prop.payoutPeriodsPaid) * businessPayoutCents(prop.businessType as BusinessType, spot);
          if (amount > 0) {
            await recordLedgerEntry(tx, {
              characterId: holder,
              amountCents: amount,
              reason: `business_revenue:${prop.spotId}`,
              idempotencyKey: `revenue:${id}:${prop.businessOpenedAt.getTime()}:${due}`,
            });
          }
          await tx.update(properties).set({ payoutPeriodsPaid: due }).where(eq(properties.id, id));
          touched.add(holder);
        }
      }
    });
  }
  return touched;
}
