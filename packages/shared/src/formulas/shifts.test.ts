import { describe, expect, it } from 'vitest';
import { BUSINESS_FOOD, JOBS } from '../config/balance.js';
import { COOKING } from '../config/cooking.js';
import type { DistrictMap } from '../map/types.js';
import { canBeHired, jobLevel, missionPayCents } from './jobs.js';
import { Shift } from './shifts.js';

const map = {
  properties: [{ id: 'h', kind: 'house', name: 'Maison, Rue X', door: { x: 40, y: 0 }, facade: { x: 40, y: 1 }, rooms: 3, centrality: 0.5 }],
} as unknown as DistrictMap;
const shop = { x: 0, y: 0 };

describe('métiers', () => {
  it('embauche selon l’apparence, paie selon le niveau', () => {
    expect(canBeHired(JOBS.minAppearanceToHire - 1)).toBe(false);
    expect(jobLevel(0)).toBe(1);
    expect(jobLevel(JOBS.levelXp[2]!)).toBe(3);
    expect(missionPayCents('courier', JOBS.levelXp[2]!, false)).toBeGreaterThan(missionPayCents('courier', 0, false));
    expect(missionPayCents('courier', 0, true)).toBe(JOBS.courier.payCents + JOBS.courier.tipCents);
  });

  it('livreur : payé à l’arrivée, pourboire si en avance, rien si trop tard', () => {
    const shift = new Shift('s1', { id: 'e', name: 'Tacos', jobType: 'courier', door: shop }, 0, map);
    shift.next(shop, 0);
    expect(shift.tick(shop, 1000)).toBeNull();
    const fast = shift.tick({ x: 40, y: 0 }, 2000)!;
    expect(fast.payCents).toBe(JOBS.courier.payCents + JOBS.courier.tipCents);
    const late = shift.tick(shop, 10_000_000)!;
    expect(late.payCents).toBe(0);
    expect(shift.index).toBe(2);
  });

  it('comptoir : la bonne commande, vite, rapporte un pourboire ; une erreur rien', () => {
    let k = 0;
    const shift = new Shift('s2', { id: 'e', name: 'Boulangerie', jobType: 'counter', door: shop }, 0, map, () => [0, 0.1, 0.5][k++ % 3]!);
    shift.next(shop, 0);
    const view = shift.view(0);
    if (view.kind !== 'counter') throw new Error('mauvaise mission');
    expect(shift.serve(['nimporte'], shop, 1000)!.payCents).toBe(0);
    const next = shift.view(1000);
    if (next.kind !== 'counter') throw new Error('mauvaise mission');
    expect(shift.serve([...next.order].reverse(), shop, 2000)!.payCents).toBe(JOBS.counter.payCents + JOBS.counter.tipCents);
  });

  it('son propre fast-food : on cuisine le plat commandé, payé selon les étoiles', () => {
    const food = BUSINESS_FOOD.fastfood;
    const pay = (share: number) => food.servePayCents + Math.round(food.tipCents * share);
    const shift = new Shift('s3', { id: 'own', name: 'Chez moi', jobType: 'counter', door: shop }, 0, map, () => 0, pay, 'fastfood');
    shift.next(shop, 0);
    const view = shift.view(0);
    if (view.kind !== 'cook') throw new Error('mauvaise mission');
    expect(view.dish).toBe('burger');
    // Trop rapide pour être vrai : refusé.
    expect(shift.cook('burger', [1, 1], shop, 10)!.payCents).toBe(0);
    const t = 10 + 2 * COOKING.minStepMs;
    const perfect = shift.cook('burger', [1, 0.9], shop, t)!;
    expect(perfect.stars).toBe(3);
    expect(perfect.payCents).toBe(food.servePayCents + food.tipCents);
    const meh = shift.cook('burger', [0.2, 0.3], shop, t + 2 * COOKING.minStepMs)!;
    expect(meh.stars).toBe(1);
    expect(meh.payCents).toBe(food.servePayCents);
    // Le client ne patiente pas indéfiniment.
    expect(shift.tick(shop, t + 2 * COOKING.minStepMs + COOKING.customerTimeoutMs + 1)!.payCents).toBe(0);
  });
});
