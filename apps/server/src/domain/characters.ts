import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  DEFAULT_DISTRICT_KEY,
  ECONOMY,
  HOME_ACTIONS,
  HOUSING,
  ageAt,
  applyGaugeEffects,
  decayGauges,
  getDistrictMap,
  snapshotGauges,
  STARTING_GAUGES,
  type CharacterSelf,
  type CreateCharacterRequest,
  type HomeActionId,
  type HomeInfo,
  type StoredGauges,
} from '@jeu-ville/shared';
import type { Db, Tx } from '../db/client.js';
import { characters, dwellings } from '../db/schema.js';
import { STARTER_DWELLING_KIND } from '../db/seed.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

type CharacterRow = typeof characters.$inferSelect;
type DwellingRow = typeof dwellings.$inferSelect;

function storedGauges(row: CharacterRow): StoredGauges {
  return { hunger: row.hunger, hygiene: row.hygiene, appearance: row.appearance, health: row.health };
}

function homeInfo(row: CharacterRow, dwelling: DwellingRow | null): HomeInfo | null {
  if (!dwelling) return null;
  const building = getDistrictMap(dwelling.districtId)?.starterBuildings.find((b) => b.id === dwelling.buildingId);
  if (!building) return null;
  return { dwellingId: dwelling.id, buildingName: dwelling.buildingName, door: building.door };
}

export function toCharacterSelf(row: CharacterRow, dwelling: DwellingRow | null, nowMs: number): CharacterSelf {
  const age = ageAt(row.createdAt.getTime(), nowMs);
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
    gauges: snapshotGauges(
      storedGauges(row),
      row.gaugesUpdatedAt.getTime(),
      nowMs,
      dwelling ? HOUSING.starterApartment.happinessBonus : 0,
    ),
    age: { years: age.years, dayOfYear: age.dayOfYear },
    home: homeInfo(row, dwelling),
    computedAt: nowMs,
  };
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
  return toCharacterSelf(row, await loadDwelling(db, row.dwellingId), nowMs);
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

    return toCharacterSelf({ ...row, moneyCents: balance }, { ...dwelling, tenantCharacterId: row.id }, now.getTime());
  });
}

/** Action « chez soi » (manger, se doucher, se changer). Verrouille le perso le temps du calcul. */
export async function performHomeAction(
  db: Db,
  characterId: string,
  actionId: HomeActionId,
  nowMs = Date.now(),
): Promise<CharacterSelf> {
  const action = HOME_ACTIONS[actionId];
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
    if (!row) throw new GameError('Personnage introuvable.', 404);
    if (!row.dwellingId) throw new GameError("Tu n'as pas de logement.");
    if (row.moneyCents < action.costCents) throw new GameError("Pas assez d'argent.");

    const current = decayGauges(storedGauges(row), nowMs - row.gaugesUpdatedAt.getTime());
    const next = applyGaugeEffects(current, action.effects);

    if (action.costCents > 0) {
      await recordLedgerEntry(tx, {
        characterId,
        amountCents: -action.costCents,
        reason: `home_action:${actionId}`,
      });
    }
    const [updated] = await tx
      .update(characters)
      .set({ ...next, gaugesUpdatedAt: new Date(nowMs) })
      .where(eq(characters.id, characterId))
      .returning();
    return toCharacterSelf(updated!, await loadDwelling(tx, row.dwellingId), nowMs);
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
