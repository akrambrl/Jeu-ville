/** Vélo et trottinette électrique : vitesse et batterie. Règles pures. */
import { VEHICLES } from '../config/balance.js';

export type VehicleKind = keyof typeof VEHICLES;

export interface OwnedVehicle {
  kind: VehicleKind;
  /** Batterie en % (le vélo n'en a pas : toujours 100). */
  battery: number;
}

/** Multiplicateur de vitesse : à pied (''), à vélo, en trottinette. */
export function speedFactor(kind: VehicleKind | ''): number {
  return kind ? VEHICLES[kind].speedFactor : 1;
}

/** Batterie après `tiles` cases parcourues. */
export function drainBattery(v: OwnedVehicle, tiles: number): OwnedVehicle {
  const spec = VEHICLES[v.kind];
  if (!('batteryPerTile' in spec)) return v;
  return { ...v, battery: Math.max(0, v.battery - tiles * spec.batteryPerTile) };
}

export function canRide(v: OwnedVehicle): boolean {
  return v.battery > 0;
}

export function hasBattery(kind: VehicleKind): boolean {
  return 'batteryPerTile' in VEHICLES[kind];
}
