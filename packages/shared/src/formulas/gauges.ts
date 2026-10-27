/**
 * Jauges du personnage, calculées de façon PARESSEUSE :
 * on stocke des valeurs + l'instant de leur dernière mise à jour, et on en
 * déduit l'état à n'importe quel instant. Aucun tick par joueur n'est nécessaire,
 * le personnage « vit » même hors ligne.
 */
import {
  GAUGE_CRITICAL_THRESHOLD,
  GAUGE_DECAY_PER_REAL_HOUR,
  GAUGE_MAX,
  HAPPINESS_WEIGHTS,
} from '../config/balance.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';

export interface StoredGauges {
  hunger: number;
  hygiene: number;
  appearance: number;
  health: number;
}

export type GaugeName = keyof StoredGauges;

export interface GaugeSnapshot extends StoredGauges {
  happiness: number;
}

export function clampGauge(value: number): number {
  return Math.min(GAUGE_MAX, Math.max(0, value));
}

/** Fait vieillir des jauges stockées de `elapsedMs` millisecondes réelles. */
export function decayGauges(stored: StoredGauges, elapsedMs: number): StoredGauges {
  const hours = Math.max(0, elapsedMs) / REAL_MS_PER_HOUR;
  const d = GAUGE_DECAY_PER_REAL_HOUR;

  // La santé chute plus vite pendant la partie de l'intervalle où la faim est à 0.
  const hoursUntilStarving = stored.hunger / d.hunger;
  const starvingHours = Math.max(0, hours - hoursUntilStarving);

  return {
    hunger: clampGauge(stored.hunger - d.hunger * hours),
    hygiene: clampGauge(stored.hygiene - d.hygiene * hours),
    appearance: clampGauge(stored.appearance - d.appearance * hours),
    health: clampGauge(stored.health - d.health * hours - d.healthWhileStarving * starvingHours),
  };
}

/** Bonheur dérivé des autres jauges et des bonus (logement…). */
export function computeHappiness(gauges: StoredGauges, bonus = 0): number {
  const w = HAPPINESS_WEIGHTS;
  const base =
    gauges.hunger * w.hunger +
    gauges.hygiene * w.hygiene +
    gauges.appearance * w.appearance +
    gauges.health * w.health;
  return clampGauge(base + bonus);
}

export function snapshotGauges(
  stored: StoredGauges,
  updatedAtMs: number,
  nowMs: number,
  happinessBonus = 0,
): GaugeSnapshot {
  const current = decayGauges(stored, nowMs - updatedAtMs);
  return { ...current, happiness: computeHappiness(current, happinessBonus) };
}

/** Applique des effets (ajouts de points) à des jauges, bornés à [0, max]. */
export function applyGaugeEffects(
  gauges: StoredGauges,
  effects: Partial<Record<GaugeName, number>>,
): StoredGauges {
  const next = { ...gauges };
  for (const [name, delta] of Object.entries(effects) as [GaugeName, number][]) {
    next[name] = clampGauge(next[name] + delta);
  }
  return next;
}

export function isCritical(value: number): boolean {
  return value < GAUGE_CRITICAL_THRESHOLD;
}
