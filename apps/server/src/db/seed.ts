/**
 * Données de référence (villes, quartiers, logements de départ) tirées des cartes.
 * Idempotent : peut être relancé à chaque démarrage.
 */
import { DISTRICT_MAPS, HOUSING, districtKey } from '@jeu-ville/shared';
import type { Db } from './client.js';
import { cities, districts, dwellings } from './schema.js';

export const STARTER_DWELLING_KIND = 'starter_apartment';

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
  }
}
