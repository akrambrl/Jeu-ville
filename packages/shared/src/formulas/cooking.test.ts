import { describe, expect, it } from 'vitest';
import { BUSINESS_FOOD } from '../config/balance.js';
import { COOKING, RECIPES } from '../config/cooking.js';
import {
  assembleScore,
  cookStars,
  countScore,
  nextReputation,
  pickDish,
  pourScore,
  reputationRevenueFactor,
  recipesFor,
  timingScore,
  validCooking,
} from './cooking.js';

describe('cuisine', () => {
  it('chaque commerce de bouche a ses plats, et chaque plat ses étapes', () => {
    for (const type of Object.keys(BUSINESS_FOOD)) {
      expect(recipesFor(type).length).toBeGreaterThanOrEqual(2);
      for (const r of recipesFor(type)) {
        expect(r.steps.length).toBeGreaterThan(0);
        expect(r.steps.length).toBeLessThanOrEqual(8);
        for (const s of r.steps) {
          if (s.gesture === 'assemble') expect(s.layers?.length).toBeGreaterThan(1);
          if (['chop', 'stir', 'mash'].includes(s.gesture)) expect(s.count).toBeGreaterThan(0);
        }
      }
    }
    expect(recipesFor('barber')).toEqual([]);
    expect(RECIPES.restaurant.map((r) => r.id)).toEqual(['steak-frites', 'couscous', 'pizza', 'mafe']);
  });

  it('pioche un plat du commerce', () => {
    expect(pickDish('fastfood', () => 0)?.id).toBe('burger');
    expect(pickDish('fastfood', () => 0.99)?.id).toBe('fries');
    expect(pickDish('laundry', () => 0)).toBeUndefined();
  });

  it('note les gestes entre 0 et 1', () => {
    expect(countScore(3, 6)).toBe(0.5);
    expect(countScore(9, 6)).toBe(1);
    expect(timingScore(0.5, 0.5)).toBe(1);
    expect(timingScore(0.5 + COOKING.timingZone, 0.5)).toBe(1);
    expect(timingScore(0, 0.5)).toBe(0);
    expect(timingScore(0.5 + COOKING.timingZone * 2.5, 0.5)).toBeCloseTo(0.5);
    expect(pourScore(COOKING.pourTarget)).toBe(1);
    expect(pourScore(0)).toBe(0);
    expect(assembleScore(5, 5, 0)).toBe(1);
    expect(assembleScore(5, 5, 2)).toBeCloseTo(0.6);
    expect(assembleScore(2, 5, 4)).toBe(0);
  });

  it('donne 1 à 3 étoiles selon la moyenne', () => {
    expect(cookStars([1, 1, 0.9])).toBe(3);
    expect(cookStars([1, 0.5])).toBe(2);
    expect(cookStars([0.2, 0.3])).toBe(1);
    expect(cookStars([])).toBe(1);
  });

  it('refuse un plat impossible (mauvais nombre d’étapes, notes hors bornes, trop rapide)', () => {
    const burger = RECIPES.fastfood[0];
    const slow = burger.steps.length * COOKING.minStepMs;
    expect(validCooking(burger, [1, 1], slow)).toBe(true);
    expect(validCooking(burger, [1], slow)).toBe(false);
    expect(validCooking(burger, [1, 2], slow)).toBe(false);
    expect(validCooking(burger, [1, Number.NaN], slow)).toBe(false);
    expect(validCooking(burger, [1, 1], slow - 1)).toBe(false);
  });

  it('la réputation se rapproche de la note, sans la dépasser, et augmente la recette', () => {
    let rep = 0;
    for (let k = 0; k < 200; k++) rep = nextReputation(rep, 3);
    expect(rep).toBe(100);
    expect(nextReputation(100, 1)).toBe(92);
    expect(nextReputation(59, 2)).toBe(60);
    expect(nextReputation(60, 2)).toBe(60);
    expect(nextReputation(21, 1)).toBe(20);
    expect(reputationRevenueFactor(0)).toBe(1);
    expect(reputationRevenueFactor(100)).toBeCloseTo(1 + COOKING.reputation.maxRevenueBonus);
  });
});
