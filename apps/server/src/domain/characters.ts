import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  DEFAULT_DISTRICT_KEY,
  ECONOMY,
  HOUSING,
  ageAt,
  getDistrictMap,
  resolveHomeAction,
  resolveFood,
  snapshotGauges,
  STARTING_GAUGES,
  type CharacterSelf,
  type CreateCharacterRequest,
  type HomeActionId,
  type HomeInfo,
  type StoredGauges,
  type StoredPet,
  type PetSpecies,
  type VehicleKind,
  petHappinessBonus,
  homeHappiness,
  kindnessAt,
  realDayKey,
  employers,
  type JobType,
  type BusinessType,
  type PropertySpot,
  type FoodPlaceKind,
} from '@jeu-ville/shared';
import type { Db, Tx } from '../db/client.js';
import { characters, dwellings, errandsDone, jobExperience, jobs, pets, properties, vehicles } from '../db/schema.js';
import { STARTER_DWELLING_KIND } from '../db/seed.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

type CharacterRow = typeof characters.$inferSelect;
type DwellingRow = typeof dwellings.$inferSelect;

export function storedGauges(row: CharacterRow): StoredGauges {
  return { hunger: row.hunger, hygiene: row.hygiene, appearance: row.appearance, health: row.health };
}

function homeInfo(row: CharacterRow, dwelling: DwellingRow | null): HomeInfo | null {
  if (row.homePropertyId) {
    const spot = homeSpot(row);
    return spot ? { dwellingId: row.homePropertyId, buildingName: spot.name, door: spot.door } : null;
  }
  if (!dwelling) return null;
  const building = getDistrictMap(dwelling.districtId)?.starterBuildings.find((b) => b.id === dwelling.buildingId);
  if (!building) return null;
  return { dwellingId: dwelling.id, buildingName: dwelling.buildingName, door: building.door };
}

type VehicleRow = typeof vehicles.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;

/** Logement de l'agence où habite le perso (null : appart de départ). */
function homeSpot(row: CharacterRow): PropertySpot | null {
  if (!row.homePropertyId) return null;
  const spotId = row.homePropertyId.slice(row.districtId.length + 1);
  return getDistrictMap(row.districtId)?.properties.find((p) => p.id === spotId) ?? null;
}
type PetRow = typeof pets.$inferSelect;

export function storedPet(row: PetRow | null): StoredPet | null {
  if (!row) return null;
  return {
    species: row.species as PetSpecies,
    coat: row.coat,
    name: row.name,
    hunger: row.hunger,
    happiness: row.happiness,
    updatedAt: row.gaugesUpdatedAt.getTime(),
  };
}

export function toCharacterSelf(
  row: CharacterRow,
  dwelling: DwellingRow | null,
  owned: {
    vehicles: VehicleRow[];
    pet: PetRow | null;
    properties: PropertyRow[];
    job?: { employerId: string; jobType: string } | null;
    xp?: { jobType: string; xp: number }[];
    /** Missions du quotidien faites aujourd'hui (ErrandOffer.id). */
    errandsToday?: string[];
  },
  nowMs: number,
): CharacterSelf {
  const age = ageAt(row.createdAt.getTime(), nowMs);
  const pet = storedPet(owned.pet);
  const housing = row.homePropertyId ? homeHappiness(homeSpot(row)) : dwelling ? HOUSING.starterApartment.happinessBonus : 0;
  const happinessBonus =
    housing + petHappinessBonus(pet, row.petLostAt?.getTime() ?? null, nowMs) + kindnessAt(row.kindness, row.kindnessUpdatedAt.getTime(), nowMs);
  return {
    id: row.id,
    name: row.name,
    look: {
      sex: row.sex as CharacterSelf['look']['sex'],
      baseLook: row.baseLook,
      skinTone: row.skinTone,
      hairColor: row.hairColor,
      bodyType: row.bodyType,
    },
    cityId: row.cityId,
    districtId: row.districtId,
    moneyCents: row.moneyCents,
    gauges: snapshotGauges(storedGauges(row), row.gaugesUpdatedAt.getTime(), nowMs, happinessBonus),
    age: { years: age.years, dayOfYear: age.dayOfYear },
    home: homeInfo(row, dwelling),
    vehicles: owned.vehicles.map((v) => ({ kind: v.kind as VehicleKind, battery: v.battery })),
    activeVehicle: row.activeVehicle as VehicleKind | '',
    pet,
    happinessBonus,
    properties: owned.properties.map((p) => ({
      spotId: p.spotId,
      relation: p.ownerCharacterId === row.id ? ('owner' as const) : ('tenant' as const),
      business: p.businessType ? { type: p.businessType as BusinessType, name: p.businessName ?? '' } : null,
    })),
    movedAt: row.movedAt?.getTime() ?? null,
    job: owned.job
      ? {
          employerId: owned.job.employerId,
          jobType: owned.job.jobType as JobType,
          employerName: employers(getDistrictMap(row.districtId)!).find((e) => e.id === owned.job!.employerId)?.name ?? '',
        }
      : null,
    jobXp: Object.fromEntries((owned.xp ?? []).map((x) => [x.jobType, x.xp])),
    errandsDoneToday: owned.errandsToday ?? [],
    computedAt: nowMs,
  };
}

/** Vue privée complète (logement, véhicules, animal) d'une ligne de personnage. */
export async function selfOf(db: Db | Tx, row: CharacterRow, nowMs: number): Promise<CharacterSelf> {
  const [dwelling, owned, [pet], held, [job], xp, errands] = await Promise.all([
    loadDwelling(db, row.dwellingId),
    db.select().from(vehicles).where(eq(vehicles.characterId, row.id)),
    db.select().from(pets).where(eq(pets.characterId, row.id)),
    db.select().from(properties).where(or(eq(properties.ownerCharacterId, row.id), eq(properties.tenantCharacterId, row.id))),
    db.select().from(jobs).where(eq(jobs.characterId, row.id)),
    db.select().from(jobExperience).where(eq(jobExperience.characterId, row.id)),
    db
      .select({ offerId: errandsDone.offerId })
      .from(errandsDone)
      .where(and(eq(errandsDone.characterId, row.id), eq(errandsDone.districtId, row.districtId), eq(errandsDone.day, realDayKey(nowMs)))),
  ]);
  const errandsToday = errands.map((e) => e.offerId);
  return toCharacterSelf(row, dwelling, { vehicles: owned, pet: pet ?? null, properties: held, job: job ?? null, xp, errandsToday }, nowMs);
}

async function loadDwelling(db: Db | Tx, id: string | null): Promise<DwellingRow | null> {
  if (!id) return null;
  const [d] = await db.select().from(dwellings).where(eq(dwellings.id, id));
  return d ?? null;
}

export async function getCharacterByPlayer(db: Db, playerId: string): Promise<CharacterRow | null> {
  const [row] = await db.select().from(characters).where(eq(characters.playerId, playerId));
  return row ?? null;
}

export async function getCharacterSelf(db: Db, characterId: string, nowMs = Date.now()): Promise<CharacterSelf | null> {
  const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
  if (!row) return null;
  return selfOf(db, row, nowMs);
}

/**
 * Crée le personnage, lui attribue un appart de départ libre et verse le capital de départ.
 * Le logement est réservé avec `FOR UPDATE SKIP LOCKED` : deux créations simultanées
 * ne peuvent jamais obtenir le même appart.
 */
export async function createCharacter(
  db: Db,
  player: { id: string; pseudo: string },
  input: CreateCharacterRequest,
): Promise<CharacterSelf> {
  const districtKey = DEFAULT_DISTRICT_KEY;
  const map = getDistrictMap(districtKey);
  if (!map) throw new GameError('Quartier de départ introuvable.', 500);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: characters.id }).from(characters).where(eq(characters.playerId, player.id));
    if (existing) throw new GameError('Tu as déjà un personnage.', 409);

    const [dwelling] = await tx
      .select()
      .from(dwellings)
      .where(
        and(
          eq(dwellings.districtId, districtKey),
          eq(dwellings.kind, STARTER_DWELLING_KIND),
          isNull(dwellings.tenantCharacterId),
        ),
      )
      // Au hasard, pour répartir les nouveaux joueurs entre les immeubles de départ.
      .orderBy(sql`random()`)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!dwelling) throw new GameError("Plus aucun appartement de départ libre dans ce quartier.", 503);

    const door = map.starterBuildings.find((b) => b.id === dwelling.buildingId)?.door ?? map.spawn;
    const now = new Date();
    const [row] = await tx
      .insert(characters)
      .values({
        playerId: player.id,
        name: player.pseudo,
        sex: input.sex,
        baseLook: input.baseLook,
        skinTone: input.skinTone,
        hairColor: input.hairColor,
        bodyType: input.bodyType,
        cityId: map.cityId,
        districtId: districtKey,
        dwellingId: dwelling.id,
        moneyCents: 0,
        ...STARTING_GAUGES,
        gaugesUpdatedAt: now,
        posX: door.x,
        posY: door.y,
        createdAt: now,
      })
      .returning();
    if (!row) throw new GameError('Création impossible.', 500);

    await tx.update(dwellings).set({ tenantCharacterId: row.id }).where(eq(dwellings.id, dwelling.id));
    const balance = await recordLedgerEntry(tx, {
      characterId: row.id,
      amountCents: ECONOMY.startingMoneyCents,
      reason: 'starting_capital',
      idempotencyKey: `starting_capital:${row.id}`,
    });

    return toCharacterSelf({ ...row, moneyCents: balance }, { ...dwelling, tenantCharacterId: row.id }, { vehicles: [], pet: null, properties: [] }, now.getTime());
  });
}

/** Action « chez soi » (manger, se doucher, se changer). Verrouille le perso le temps du calcul. */
export async function performHomeAction(
  db: Db,
  characterId: string,
  actionId: HomeActionId,
  nowMs = Date.now(),
): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
    if (!row) throw new GameError('Personnage introuvable.', 404);
    if (!row.dwellingId) throw new GameError("Tu n'as pas de logement.");

    const result = resolveHomeAction(actionId, storedGauges(row), row.gaugesUpdatedAt.getTime(), row.moneyCents, nowMs);
    if (!result.ok) throw new GameError(result.error);
    if (result.moneyDeltaCents !== 0) {
      await recordLedgerEntry(tx, {
        characterId,
        amountCents: result.moneyDeltaCents,
        reason: `home_action:${actionId}`,
      });
    }
    const [updated] = await tx
      .update(characters)
      .set({ ...result.gauges, gaugesUpdatedAt: new Date(nowMs) })
      .where(eq(characters.id, characterId))
      .returning();
    return selfOf(tx, updated!, nowMs);
  });
}

/** Manger dehors : `itemId` acheté à un endroit de type `kind` (la proximité est vérifiée par la room). */
export async function buyFood(db: Db, characterId: string, kind: FoodPlaceKind, itemId: string, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
    if (!row) throw new GameError('Personnage introuvable.', 404);

    const result = resolveFood(kind, itemId, storedGauges(row), row.gaugesUpdatedAt.getTime(), row.moneyCents, nowMs);
    if (!result.ok) throw new GameError(result.error);
    await recordLedgerEntry(tx, {
      characterId,
      amountCents: result.moneyDeltaCents,
      reason: `food:${kind}:${itemId}`,
    });
    const [updated] = await tx
      .update(characters)
      .set({ ...result.gauges, gaugesUpdatedAt: new Date(nowMs) })
      .where(eq(characters.id, characterId))
      .returning();
    return selfOf(tx, updated!, nowMs);
  });
}

/** Paiement simple (ticket de bus…) : verrouille le perso, vérifie le solde, trace dans le journal. */
export async function payFee(db: Db, characterId: string, amountCents: number, reason: string): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
    if (!row) throw new GameError('Personnage introuvable.', 404);
    if (row.moneyCents < amountCents) throw new GameError("Pas assez d'argent.");
    await recordLedgerEntry(tx, { characterId, amountCents: -amountCents, reason });
    return selfOf(tx, (await tx.select().from(characters).where(eq(characters.id, characterId)))[0]!, Date.now());
  });
}

export async function getCharacterPosition(db: Db, characterId: string): Promise<{ x: number; y: number } | null> {
  const [row] = await db
    .select({ x: characters.posX, y: characters.posY })
    .from(characters)
    .where(eq(characters.id, characterId));
  return row ?? null;
}

export async function savePosition(db: Db, characterId: string, x: number, y: number): Promise<void> {
  await db.update(characters).set({ posX: x, posY: y }).where(eq(characters.id, characterId));
}

/** Utilisé par les tests et l'admin : solde recalculé depuis le journal. */
export async function ledgerBalance(db: Db, characterId: string): Promise<number> {
  const [r] = await db.execute<{ total: string | null }>(
    sql`select sum(amount_cents)::text as total from ledger_entries where character_id = ${characterId}`,
  ).then((res) => res.rows);
  return Number(r?.total ?? 0);
}
