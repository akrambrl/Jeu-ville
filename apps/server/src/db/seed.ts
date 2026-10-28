/**
 * Données de référence (villes, quartiers, logements de départ) tirées des cartes.
 * Idempotent : relancé à chaque démarrage. Quand une carte est régénérée, les
 * habitants des immeubles disparus sont relogés dans les nouveaux, et les biens
 * de l'agence qui n'existent plus sont rendus (achat remboursé au journal).
 */
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { DISTRICT_MAPS, HOUSING, districtKey, type DistrictMap } from '@jeu-ville/shared';
import type { Db } from './client.js';
import { recordLedgerEntry } from '../domain/ledger.js';
import { backToStarter } from '../domain/realEstate.js';
import { characters, cities, districts, dwellings, ledgerEntries, properties } from './schema.js';

export const STARTER_DWELLING_KIND = 'starter_apartment';
/** Lignes insérées par requête (limite de paramètres de Postgres). */
const SEED_BATCH = 500;

export async function seedReferenceData(db: Db): Promise<void> {
  for (const map of Object.values(DISTRICT_MAPS)) {
    const key = districtKey(map);
    await db.insert(cities).values({ id: map.cityId, name: map.cityName, unlocked: true }).onConflictDoNothing();
    await db.insert(districts).values({ id: key, cityId: map.cityId, name: map.districtName }).onConflictDoNothing();

    const rows = map.starterBuildings.flatMap((b) => {
      const count = b.levels * HOUSING.starterApartment.apartmentsPerLevel;
      return Array.from({ length: count }, (_, n) => ({
        id: `${key}:${b.id}:${n + 1}`,
        districtId: key,
        buildingId: b.id,
        buildingName: b.name,
        kind: STARTER_DWELLING_KIND,
        weeklyRentCents: HOUSING.starterApartment.weeklyRentCents,
      }));
    });
    if (rows.length > 0) await db.insert(dwellings).values(rows).onConflictDoNothing();
    // Biens de l'agence immobilière (appartenant aux bots tant qu'aucun joueur ne les prend).
    const spots = map.properties.map((p) => ({ id: `${key}:${p.id}`, districtId: key, spotId: p.id, kind: p.kind }));
    for (let k = 0; k < spots.length; k += SEED_BATCH) {
      await db.insert(properties).values(spots.slice(k, k + SEED_BATCH)).onConflictDoNothing();
    }
    await retireRemovedBuildings(db, key, map);
    await retireRemovedProperties(db, key, map);
  }
}

/** Reloge les habitants des immeubles qui ne sont plus sur la carte, puis supprime ces logements. */
async function retireRemovedBuildings(db: Db, key: string, map: DistrictMap): Promise<void> {
  const current = map.starterBuildings.map((b) => b.id);
  if (current.length === 0) return;
  await db.transaction(async (tx) => {
    const stale = and(
      eq(dwellings.districtId, key),
      eq(dwellings.kind, STARTER_DWELLING_KIND),
      notInArray(dwellings.buildingId, current),
    );
    const occupied = await tx.select().from(dwellings).where(and(stale, sql`${dwellings.tenantCharacterId} is not null`)).for('update');
    for (const old of occupied) {
      const [fresh] = await tx
        .select()
        .from(dwellings)
        .where(and(eq(dwellings.districtId, key), inArray(dwellings.buildingId, current), isNull(dwellings.tenantCharacterId)))
        .orderBy(sql`random()`)
        .limit(1)
        .for('update', { skipLocked: true });
      const characterId = old.tenantCharacterId!;
      await tx.update(dwellings).set({ tenantCharacterId: null }).where(eq(dwellings.id, old.id));
      if (!fresh) {
        await tx.update(characters).set({ dwellingId: null }).where(eq(characters.id, characterId));
        continue;
      }
      const door = map.starterBuildings.find((b) => b.id === fresh.buildingId)!.door;
      await tx.update(dwellings).set({ tenantCharacterId: characterId }).where(eq(dwellings.id, fresh.id));
      await tx.update(characters).set({ dwellingId: fresh.id, posX: door.x, posY: door.y }).where(eq(characters.id, characterId));
    }
    await tx.delete(dwellings).where(stale);
  });
}

/**
 * Biens de l'agence qui ne sont plus sur la carte : le propriétaire est
 * remboursé de son dernier achat (journal, une seule fois), personne n'y habite
 * plus (retour à l'appart de départ), puis la ligne est supprimée.
 */
async function retireRemovedProperties(db: Db, key: string, map: DistrictMap): Promise<void> {
  const current = new Set(map.properties.map((p) => p.id));
  const rows = await db.select().from(properties).where(eq(properties.districtId, key));
  for (const row of rows.filter((r) => !current.has(r.spotId))) {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(properties).where(eq(properties.id, row.id)).for('update');
      if (!locked) return;
      const owner = locked.ownerCharacterId;
      if (owner) {
        const [paid] = await tx
          .select({ amount: ledgerEntries.amountCents })
          .from(ledgerEntries)
          .where(and(eq(ledgerEntries.characterId, owner), eq(ledgerEntries.reason, `property_buy:${locked.spotId}`)))
          .orderBy(sql`${ledgerEntries.createdAt} desc`)
          .limit(1);
        if (paid && paid.amount < 0) {
          await tx.select().from(characters).where(eq(characters.id, owner)).for('update');
          await recordLedgerEntry(tx, {
            characterId: owner,
            amountCents: -paid.amount,
            reason: `property_retired:${locked.spotId}`,
            idempotencyKey: `property:retired:${locked.id}:${owner}`,
          });
        }
      }
      for (const who of [owner, locked.tenantCharacterId].filter((c): c is string => !!c)) {
        const [c] = await tx.select({ home: characters.homePropertyId }).from(characters).where(eq(characters.id, who));
        if (c?.home === locked.id) await backToStarter(tx, who, key);
      }
      await tx.delete(properties).where(eq(properties.id, locked.id));
    });
  }
}
