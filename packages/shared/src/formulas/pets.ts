/**
 * Animaux de compagnie : jauges paresseuses (valeur + taux × temps), promenade,
 * croquettes, refuge si négligé. Règles pures, appliquées par le serveur et la démo.
 */
import { PETS } from '../config/balance.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';
import { clampGauge } from './gauges.js';

export type PetSpecies = keyof typeof PETS.species;

export interface StoredPet {
  species: PetSpecies;
  coat: number;
  name: string;
  hunger: number;
  happiness: number;
  /** Instant (ms) des valeurs ci-dessus. */
  updatedAt: number;
}

/** Jauges de l'animal à l'instant `nowMs`. */
export function petGauges(pet: StoredPet, nowMs: number): { hunger: number; happiness: number } {
  const hours = Math.max(0, nowMs - pet.updatedAt) / REAL_MS_PER_HOUR;
  return {
    hunger: clampGauge(pet.hunger - hours * PETS.hungerDecayPerRealHour),
    happiness: clampGauge(pet.happiness - hours * PETS.happinessDecayPerRealHour),
  };
}

/** Négligé : ventre vide depuis plus de `PETS.neglectHours` → recueilli par un refuge. */
export function isPetNeglected(pet: StoredPet, nowMs: number): boolean {
  const emptyAt = pet.updatedAt + (pet.hunger / PETS.hungerDecayPerRealHour) * REAL_MS_PER_HOUR;
  return nowMs - emptyAt > PETS.neglectHours * REAL_MS_PER_HOUR;
}

/** Nouvel animal adopté, rassasié et content. */
export function adoptPet(species: PetSpecies, rand: () => number, nowMs: number): StoredPet {
  const names = PETS.species[species].names;
  return {
    species,
    coat: Math.floor(rand() * PETS.coats),
    name: names[Math.floor(rand() * names.length)]!,
    hunger: 100,
    happiness: 100,
    updatedAt: nowMs,
  };
}

export function feedPet(pet: StoredPet, nowMs: number): StoredPet {
  const g = petGauges(pet, nowMs);
  return { ...pet, hunger: clampGauge(g.hunger + PETS.kibble.hunger), happiness: g.happiness, updatedAt: nowMs };
}

/** Promenade : chaque case parcourue avec son animal le rend plus heureux. */
export function walkPet(pet: StoredPet, tiles: number, nowMs: number): StoredPet {
  const g = petGauges(pet, nowMs);
  return { ...pet, hunger: g.hunger, happiness: clampGauge(g.happiness + tiles * PETS.walkHappinessPerTile), updatedAt: nowMs };
}

/** Effet sur le bonheur du joueur : animal heureux, ou chagrin après l'avoir perdu. */
export function petHappinessBonus(pet: StoredPet | null, petLostAtMs: number | null, nowMs: number): number {
  if (pet) return (PETS.happinessBonus * petGauges(pet, nowMs).happiness) / 100;
  if (petLostAtMs !== null && nowMs - petLostAtMs < PETS.lossPenaltyHours * REAL_MS_PER_HOUR) return PETS.lossPenalty;
  return 0;
}

/** Apparence vue par les autres joueurs (« dog:2 »). */
export function petLook(pet: StoredPet | null): string {
  return pet ? `${pet.species}:${pet.coat}` : '';
}
