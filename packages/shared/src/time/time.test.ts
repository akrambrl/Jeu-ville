import { describe, expect, it } from 'vitest';
import { TIME } from '../config/balance.js';
import { ageAt, REAL_MS_PER_GAME_DAY } from './index.js';

describe('temps de jeu', () => {
  it('un personnage commence à 25 ans', () => {
    expect(ageAt(0, 0)).toEqual({ years: 25, dayOfYear: 0, reachedMaxAge: false });
  });

  it('1 semaine réelle = 1 an de jeu', () => {
    expect(ageAt(0, TIME.realMsPerGameYear).years).toBe(26);
  });

  it('1 jour de jeu ≈ 27,6 minutes réelles', () => {
    expect(REAL_MS_PER_GAME_DAY / 60_000).toBeCloseTo(27.6, 1);
  });

  it('atteint 70 ans après 45 semaines', () => {
    expect(ageAt(0, 45 * TIME.realMsPerGameYear).reachedMaxAge).toBe(true);
    expect(ageAt(0, 44 * TIME.realMsPerGameYear).reachedMaxAge).toBe(false);
  });
});
