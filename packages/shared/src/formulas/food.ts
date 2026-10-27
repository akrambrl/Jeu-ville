/**
 * Manger dehors : chez un marchand ambulant ou dans un commerce (boulangerie,
 * fast-food, grande surface). Règles pures, appliquées par le serveur (et la démo solo).
 */
import { FOOD_MENUS, MOVEMENT, type FoodItem } from '../config/balance.js';
import type { DistrictMap } from '../map/types.js';
import { applyGaugeEffects, decayGauges, type StoredGauges } from './gauges.js';
import type { HomeActionResult } from './homeActions.js';

export type FoodPlaceKind = keyof typeof FOOD_MENUS;

/** Endroit où l'on peut acheter à manger ; on achète en se tenant à côté de (x, y). */
export interface FoodPlace {
  id: string;
  kind: FoodPlaceKind;
  name: string;
  x: number;
  y: number;
}

const VENDOR_NAMES: Record<'corn' | 'chestnut', string> = { corn: 'Marchand de maïs', chestnut: 'Marchand de marrons' };
const SHOP_KINDS = new Set<string>(['bakery', 'fastfood', 'supermarket']);

/** Tous les endroits où manger dans le quartier (identifiants stables, déduits de la carte). */
export function foodPlaces(map: DistrictMap): FoodPlace[] {
  const places: FoodPlace[] = map.vendors.map((v) => ({ id: v.id, kind: v.kind, name: VENDOR_NAMES[v.kind], x: v.x, y: v.y }));
  for (const p of map.pois) {
    if (!SHOP_KINDS.has(p.kind)) continue;
    places.push({ id: `${p.kind}-${p.entrance.x}-${p.entrance.y}`, kind: p.kind as FoodPlaceKind, name: p.name, x: p.entrance.x, y: p.entrance.y });
  }
  return places;
}

/** Endroit où manger à portée de (x, y), le plus proche ; null s'il n'y en a pas. */
export function foodPlaceInReach(places: FoodPlace[], x: number, y: number): FoodPlace | null {
  let best: FoodPlace | null = null;
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

export function foodMenu(kind: FoodPlaceKind): readonly FoodItem[] {
  return FOOD_MENUS[kind];
}

export function resolveFood(
  kind: FoodPlaceKind,
  itemId: string,
  stored: StoredGauges,
  gaugesUpdatedAtMs: number,
  moneyCents: number,
  nowMs: number,
): HomeActionResult {
  const item = foodMenu(kind).find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "Ce n'est pas au menu ici." };
  if (moneyCents < item.costCents) return { ok: false, error: "Pas assez d'argent." };
  const current = decayGauges(stored, nowMs - gaugesUpdatedAtMs);
  return { ok: true, gauges: applyGaugeEffects(current, item.effects), moneyDeltaCents: -item.costCents };
}
