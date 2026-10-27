import { describe, expect, it } from 'vitest';
import { FOOD_MENUS, MOVEMENT } from '../config/balance.js';
import type { DistrictMap } from '../map/types.js';
import { foodPlaceInReach, foodPlaces, resolveFood } from './food.js';

const hungry = { hunger: 30, hygiene: 100, appearance: 100, health: 90 };

describe('resolveFood', () => {
  it('fait payer le prix du menu et nourrit', () => {
    const menu = FOOD_MENUS.fastfood[1];
    const r = resolveFood('fastfood', menu.id, hungry, 0, 10_000, 0);
    expect(r).toEqual({ ok: true, gauges: { ...hungry, hunger: 30 + menu.effects.hunger }, moneyDeltaCents: -menu.costCents });
  });

  it('les fruits de la grande surface font aussi du bien à la santé', () => {
    const r = resolveFood('supermarket', 'fruit', hungry, 0, 10_000, 0);
    expect(r.ok && r.gauges.health).toBe(90 + FOOD_MENUS.supermarket[0].effects.health);
  });

  it("refuse sans assez d'argent, ou un article qui n'est pas au menu", () => {
    expect(resolveFood('chestnut', 'chestnuts', hungry, 0, FOOD_MENUS.chestnut[0].costCents - 1, 0).ok).toBe(false);
    expect(resolveFood('bakery', 'menu', hungry, 0, 10_000, 0).ok).toBe(false);
  });
});

describe('foodPlaces', () => {
  const map = {
    vendors: [{ id: 'corn-1', kind: 'corn', x: 10, y: 10, facing: { x: 10, y: 12 } }],
    pois: [
      { kind: 'fastfood', name: 'Tacos', x: 20, y: 9, entrance: { x: 20, y: 10 } },
      { kind: 'townhall', name: 'Mairie', x: 30, y: 9, entrance: { x: 30, y: 10 } },
    ],
  } as unknown as DistrictMap;
  const places = foodPlaces(map);

  it('réunit marchands ambulants et commerces où manger', () => {
    expect(places.map((p) => p.id)).toEqual(['corn-1', 'fastfood-20-10']);
  });

  it("trouve l'endroit le plus proche à portée, personne trop loin", () => {
    expect(foodPlaceInReach(places, 20, 10 + MOVEMENT.foodInteractionRange)?.id).toBe('fastfood-20-10');
    expect(foodPlaceInReach(places, 15, 15)).toBeNull();
  });
});
