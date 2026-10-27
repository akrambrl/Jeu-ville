import { describe, expect, it } from 'vitest';
import { GAUGE_DECAY_PER_REAL_HOUR, GAUGE_MAX } from '../config/balance.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';
import { applyGaugeEffects, computeHappiness, decayGauges, snapshotGauges } from './gauges.js';

const full = { hunger: 100, hygiene: 100, appearance: 100, health: 100 };

describe('decayGauges', () => {
  it('ne change rien sans temps écoulé', () => {
    expect(decayGauges(full, 0)).toEqual(full);
  });

  it('décroît linéairement selon la config', () => {
    const after = decayGauges(full, 10 * REAL_MS_PER_HOUR);
    expect(after.hunger).toBeCloseTo(100 - 10 * GAUGE_DECAY_PER_REAL_HOUR.hunger);
    expect(after.hygiene).toBeCloseTo(100 - 10 * GAUGE_DECAY_PER_REAL_HOUR.hygiene);
  });

  it('ne descend jamais sous 0', () => {
    const after = decayGauges(full, 1000 * REAL_MS_PER_HOUR);
    for (const v of Object.values(after)) expect(v).toBe(0);
  });

  it("accélère la perte de santé seulement pendant que la faim est à 0", () => {
    const d = GAUGE_DECAY_PER_REAL_HOUR;
    const start = { ...full, hunger: 10 };
    const hoursToStarve = 10 / d.hunger;
    const hours = hoursToStarve + 2;
    const after = decayGauges(start, hours * REAL_MS_PER_HOUR);
    expect(after.health).toBeCloseTo(100 - d.health * hours - d.healthWhileStarving * 2);
  });

  it('est cohérente quand on découpe le temps en morceaux', () => {
    const start = { hunger: 30, hygiene: 50, appearance: 70, health: 80 };
    const once = decayGauges(start, 40 * REAL_MS_PER_HOUR);
    const twice = decayGauges(decayGauges(start, 15 * REAL_MS_PER_HOUR), 25 * REAL_MS_PER_HOUR);
    for (const k of Object.keys(once) as (keyof typeof once)[]) {
      expect(twice[k]).toBeCloseTo(once[k]);
    }
  });
});

describe('happiness', () => {
  it('vaut le max quand tout est plein', () => {
    expect(computeHappiness(full)).toBeCloseTo(GAUGE_MAX);
  });

  it('est bornée avec un bonus', () => {
    expect(computeHappiness(full, 50)).toBe(GAUGE_MAX);
  });

  it('snapshot inclut le bonheur', () => {
    const s = snapshotGauges(full, 0, 0);
    expect(s.happiness).toBeCloseTo(GAUGE_MAX);
  });
});

describe('applyGaugeEffects', () => {
  it('ajoute et borne', () => {
    const r = applyGaugeEffects({ ...full, hunger: 70 }, { hunger: 60 });
    expect(r.hunger).toBe(GAUGE_MAX);
  });
});
