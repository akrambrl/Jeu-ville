import { describe, expect, it } from 'vitest';
import { BUSINESS_TYPES, REAL_ESTATE } from '../config/balance.js';
import type { PropertySpot } from '../map/types.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';
import { businessPayoutCents, monthlyRentCents, canMove, payoutPeriodsDue, rentPerPeriodCents, rentPeriodsDue, salePriceCents, weeklyRentCents } from './realEstate.js';

const spot = (kind: PropertySpot['kind'], centrality: number, rooms = 2): PropertySpot => ({
  id: 'x',
  kind,
  name: 'x',
  door: { x: 0, y: 0 },
  facade: { x: 0, y: 1 },
  rooms,
  centrality,
});
const DAY = 24 * REAL_MS_PER_HOUR;

describe('immobilier', () => {
  it('plus cher au centre, et plus grand = plus cher', () => {
    expect(salePriceCents(spot('apartment', 1))).toBeGreaterThan(salePriceCents(spot('apartment', 0)));
    expect(weeklyRentCents(spot('apartment', 0.5, 4))).toBeGreaterThan(weeklyRentCents(spot('apartment', 0.5, 2)));
    expect(salePriceCents(spot('house', 0.3)) % REAL_ESTATE.roundingCents).toBe(0);
  });

  it('le loyer se paie par jour, le premier à la signature', () => {
    expect(rentPeriodsDue(0, 0)).toBe(1);
    expect(rentPeriodsDue(0, 2.5 * DAY)).toBe(3);
    expect(rentPerPeriodCents(spot('local', 0.5, 1)) * 7).toBeCloseTo(weeklyRentCents(spot('local', 0.5, 1)), -2);
    // Affiché au mois : environ 4,33 semaines, arrondi à l'euro.
    const local = spot('local', 0.5, 1);
    expect(monthlyRentCents(local) % 100).toBe(0);
    expect(Math.abs(monthlyRentCents(local) - (weeklyRentCents(local) * 52) / 12)).toBeLessThanOrEqual(50);
  });

  it('un commerce verse son bénéfice chaque heure, charges déduites', () => {
    const s = spot('local', 0.5, 1);
    expect(payoutPeriodsDue(0, 3.5 * REAL_MS_PER_HOUR)).toBe(3);
    expect(businessPayoutCents('snack', s) * 24).toBeLessThan(BUSINESS_TYPES.snack.dailyRevenueCents);
  });

  it('un déménagement toutes les deux semaines au plus', () => {
    expect(canMove(null, 0)).toBe(true);
    expect(canMove(0, (REAL_ESTATE.moveCooldownDays - 1) * DAY)).toBe(false);
    expect(canMove(0, REAL_ESTATE.moveCooldownDays * DAY)).toBe(true);
  });
});
