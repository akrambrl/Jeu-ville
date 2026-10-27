/** Achat d'un en-cas à un marchand ambulant : règles pures, appliquées par le serveur (et la démo solo). */
import { MOVEMENT, STREET_FOOD } from '../config/balance.js';
import type { DistrictMap, StreetVendor } from '../map/types.js';
import { applyGaugeEffects, decayGauges, type StoredGauges } from './gauges.js';
import type { HomeActionResult } from './homeActions.js';

export function resolveStreetFood(
  vendor: StreetVendor,
  stored: StoredGauges,
  gaugesUpdatedAtMs: number,
  moneyCents: number,
  nowMs: number,
): HomeActionResult {
  const food = STREET_FOOD[vendor.kind];
  if (moneyCents < food.costCents) return { ok: false, error: "Pas assez d'argent." };
  const current = decayGauges(stored, nowMs - gaugesUpdatedAtMs);
  return { ok: true, gauges: applyGaugeEffects(current, food.effects), moneyDeltaCents: -food.costCents };
}

/** Marchand ambulant à portée de la position (x, y), le plus proche ; null s'il n'y en a pas. */
export function vendorInReach(map: DistrictMap, x: number, y: number): StreetVendor | null {
  let best: StreetVendor | null = null;
  let bestD: number = MOVEMENT.vendorInteractionRange;
  for (const v of map.vendors) {
    const d = Math.hypot(v.x - x, v.y - y);
    if (d <= bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}
