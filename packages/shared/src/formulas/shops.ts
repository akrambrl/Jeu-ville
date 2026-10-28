/**
 * Boutiques où l'on achète autre chose que de la nourriture : magasin de cycles
 * (vélo, trottinette) et animalerie (adopter un animal).
 */
import { MOVEMENT, PETS, VEHICLES } from '../config/balance.js';
import type { DistrictMap } from '../map/types.js';
import type { PetSpecies } from './pets.js';
import type { VehicleKind } from './vehicles.js';

export type ShopKind = 'cycles' | 'petshop';

export type ShopItem =
  | { id: string; type: 'vehicle'; vehicle: VehicleKind; label: string; icon: string; costCents: number }
  | { id: string; type: 'pet'; species: PetSpecies; label: string; icon: string; costCents: number };

export interface ShopPlace {
  id: string;
  kind: ShopKind;
  name: string;
  x: number;
  y: number;
}

export function shopItems(kind: ShopKind): ShopItem[] {
  if (kind === 'cycles') {
    return (Object.keys(VEHICLES) as VehicleKind[]).map((v) => ({
      id: v,
      type: 'vehicle' as const,
      vehicle: v,
      label: VEHICLES[v].label,
      icon: VEHICLES[v].icon,
      costCents: VEHICLES[v].priceCents,
    }));
  }
  return (Object.keys(PETS.species) as PetSpecies[]).map((s) => ({
    id: s,
    type: 'pet' as const,
    species: s,
    label: `Adopter un ${PETS.species[s].label.toLowerCase()}`,
    icon: PETS.species[s].icon,
    costCents: PETS.species[s].priceCents,
  }));
}

export function shopPlaces(map: DistrictMap): ShopPlace[] {
  return map.pois
    .filter((p): p is typeof p & { kind: ShopKind } => p.kind === 'cycles' || p.kind === 'petshop')
    .map((p) => ({ id: `${p.kind}-${p.entrance.x}-${p.entrance.y}`, kind: p.kind, name: p.name, x: p.entrance.x, y: p.entrance.y }));
}

export function shopInReach(places: ShopPlace[], x: number, y: number): ShopPlace | null {
  let best: ShopPlace | null = null;
  let bestD: number = MOVEMENT.foodInteractionRange;
  for (const p of places) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
