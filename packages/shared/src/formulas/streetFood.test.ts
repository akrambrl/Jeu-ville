import { describe, expect, it } from 'vitest';
import { MOVEMENT, STREET_FOOD } from '../config/balance.js';
import type { DistrictMap, StreetVendor } from '../map/types.js';
import { resolveStreetFood, vendorInReach } from './streetFood.js';

const hungry = { hunger: 30, hygiene: 100, appearance: 100, health: 100 };
const corn: StreetVendor = { id: 'corn-1', kind: 'corn', x: 10, y: 10, facing: { x: 10, y: 12 } };
const chestnut: StreetVendor = { id: 'chestnut-2', kind: 'chestnut', x: 14, y: 10, facing: { x: 14, y: 12 } };

describe('resolveStreetFood', () => {
  it('fait payer le prix de la config et nourrit', () => {
    const r = resolveStreetFood(corn, hungry, 0, 10_000, 0);
    expect(r).toEqual({ ok: true, gauges: { ...hungry, hunger: 30 + STREET_FOOD.corn.effects.hunger }, moneyDeltaCents: -STREET_FOOD.corn.costCents });
  });

  it("refuse sans assez d'argent", () => {
    expect(resolveStreetFood(chestnut, hungry, 0, STREET_FOOD.chestnut.costCents - 1, 0).ok).toBe(false);
  });
});

describe('vendorInReach', () => {
  const map = { vendors: [corn, chestnut] } as unknown as DistrictMap;

  it('trouve le marchand le plus proche à portée', () => {
    expect(vendorInReach(map, 13, 10)?.id).toBe('chestnut-2');
    expect(vendorInReach(map, 10, 10 + MOVEMENT.vendorInteractionRange)?.id).toBe('corn-1');
  });

  it('ne trouve personne trop loin', () => {
    expect(vendorInReach(map, 12, 13)).toBeNull();
  });
});
