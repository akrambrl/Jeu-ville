/**
 * Ce que possède un personnage en plus de son argent : vélo, trottinette,
 * animal de compagnie. Chaque opération verrouille le perso (FOR UPDATE) et
 * trace l'argent dans le journal.
 */
import { and, eq } from 'drizzle-orm';
import {
  PETS,
  VEHICLES,
  adoptPet as newPet,
  drainBattery,
  feedPet as fedPet,
  isPetNeglected,
  walkPet as walkedPet,
  type CharacterSelf,
  type PetSpecies,
  type VehicleKind,
} from '@jeu-ville/shared';
import type { Db, Tx } from '../db/client.js';
import { characters, pets, vehicles } from '../db/schema.js';
import { selfOf, storedPet } from './characters.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

async function lockCharacter(tx: Tx, characterId: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
  if (!row) throw new GameError('Personnage introuvable.', 404);
  return row;
}

async function reload(tx: Tx, characterId: string, nowMs: number): Promise<CharacterSelf> {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId));
  return selfOf(tx, row!, nowMs);
}

// ---------- Véhicules ----------

export async function buyVehicle(db: Db, characterId: string, kind: VehicleKind, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const [owned] = await tx.select().from(vehicles).where(and(eq(vehicles.characterId, characterId), eq(vehicles.kind, kind)));
    if (owned) throw new GameError(`Tu as déjà un ${VEHICLES[kind].label.toLowerCase()}.`);
    const price = VEHICLES[kind].priceCents;
    if (row.moneyCents < price) throw new GameError("Pas assez d'argent.");
    await recordLedgerEntry(tx, { characterId, amountCents: -price, reason: `vehicle:${kind}` });
    await tx.insert(vehicles).values({ characterId, kind, battery: 100 });
    // On repart directement avec.
    await tx.update(characters).set({ activeVehicle: kind }).where(eq(characters.id, characterId));
    return reload(tx, characterId, nowMs);
  });
}

/** Monter sur un véhicule qu'on possède (et qui a de la batterie), ou descendre (''). */
export async function setActiveVehicle(db: Db, characterId: string, kind: VehicleKind | '', nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    await lockCharacter(tx, characterId);
    if (kind) {
      const [owned] = await tx.select().from(vehicles).where(and(eq(vehicles.characterId, characterId), eq(vehicles.kind, kind)));
      if (!owned) throw new GameError("Tu n'as pas ce véhicule.");
      if (owned.battery <= 0) throw new GameError('Batterie vide : recharge-la chez toi.');
    }
    await tx.update(characters).set({ activeVehicle: kind }).where(eq(characters.id, characterId));
    return reload(tx, characterId, nowMs);
  });
}

/** Recharge de la trottinette (chez soi, vérifié par la room). */
export async function chargeScooter(db: Db, characterId: string, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    await lockCharacter(tx, characterId);
    const updated = await tx
      .update(vehicles)
      .set({ battery: 100 })
      .where(and(eq(vehicles.characterId, characterId), eq(vehicles.kind, 'scooter')))
      .returning();
    if (updated.length === 0) throw new GameError("Tu n'as pas de trottinette.");
    return reload(tx, characterId, nowMs);
  });
}

/** Trajet fini : batterie consommée ; à plat, on redescend à pied. Renvoie la batterie restante. */
export async function recordRide(db: Db, characterId: string, kind: VehicleKind, tiles: number): Promise<number> {
  return db.transaction(async (tx) => {
    await lockCharacter(tx, characterId);
    const [v] = await tx.select().from(vehicles).where(and(eq(vehicles.characterId, characterId), eq(vehicles.kind, kind))).for('update');
    if (!v) return 0;
    const battery = drainBattery({ kind, battery: v.battery }, tiles).battery;
    await tx.update(vehicles).set({ battery }).where(eq(vehicles.id, v.id));
    if (battery <= 0) await tx.update(characters).set({ activeVehicle: '' }).where(eq(characters.id, characterId));
    return battery;
  });
}

// ---------- Animaux ----------

export async function adoptPet(db: Db, characterId: string, species: PetSpecies, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const [existing] = await tx.select({ id: pets.id }).from(pets).where(eq(pets.characterId, characterId));
    if (existing) throw new GameError("Tu as déjà un animal : occupe-t'en bien !");
    const price = PETS.species[species].priceCents;
    if (row.moneyCents < price) throw new GameError("Pas assez d'argent.");
    await recordLedgerEntry(tx, { characterId, amountCents: -price, reason: `pet:${species}` });
    const pet = newPet(species, Math.random, nowMs);
    await tx.insert(pets).values({
      characterId,
      species: pet.species,
      coat: pet.coat,
      name: pet.name,
      hunger: pet.hunger,
      happiness: pet.happiness,
      gaugesUpdatedAt: new Date(nowMs),
    });
    return reload(tx, characterId, nowMs);
  });
}

export async function feedPet(db: Db, characterId: string, nowMs = Date.now()): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const [p] = await tx.select().from(pets).where(eq(pets.characterId, characterId)).for('update');
    if (!p) throw new GameError("Tu n'as pas d'animal.");
    if (row.moneyCents < PETS.kibble.costCents) throw new GameError("Pas assez d'argent.");
    await recordLedgerEntry(tx, { characterId, amountCents: -PETS.kibble.costCents, reason: 'pet_food' });
    const fed = fedPet(storedPet(p)!, nowMs);
    await tx.update(pets).set({ hunger: fed.hunger, happiness: fed.happiness, gaugesUpdatedAt: new Date(nowMs) }).where(eq(pets.id, p.id));
    return reload(tx, characterId, nowMs);
  });
}

/** Promenade terminée : l'animal est plus heureux. */
export async function recordPetWalk(db: Db, characterId: string, tiles: number, nowMs = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(pets).where(eq(pets.characterId, characterId)).for('update');
    if (!p) return;
    const walked = walkedPet(storedPet(p)!, tiles, nowMs);
    await tx.update(pets).set({ hunger: walked.hunger, happiness: walked.happiness, gaugesUpdatedAt: new Date(nowMs) }).where(eq(pets.id, p.id));
  });
}

/**
 * Animal négligé (ventre vide trop longtemps) : un refuge le recueille et le
 * joueur paie une amende. Idempotent (clé par animal). Renvoie le message à afficher.
 */
export async function enforcePetCare(db: Db, characterId: string, nowMs = Date.now()): Promise<string | null> {
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const [p] = await tx.select().from(pets).where(eq(pets.characterId, characterId)).for('update');
    if (!p || !isPetNeglected(storedPet(p)!, nowMs)) return null;
    const fine = Math.min(row.moneyCents, PETS.shelterFineCents);
    if (fine > 0) await recordLedgerEntry(tx, { characterId, amountCents: -fine, reason: 'shelter_fine', idempotencyKey: `shelter:${p.id}` });
    await tx.delete(pets).where(eq(pets.id, p.id));
    await tx.update(characters).set({ petLostAt: new Date(nowMs) }).where(eq(characters.id, characterId));
    return `${p.name} n'a pas été nourri depuis trop longtemps : un refuge l'a recueilli. Amende : ${fine / 100} €.`;
  });
}
