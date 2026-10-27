/**
 * Module UNIQUE de conversion temps réel ↔ temps de jeu.
 * 1 an de jeu = 1 semaine réelle.
 */
import { TIME } from '../config/balance.js';

export const REAL_MS_PER_GAME_DAY = TIME.realMsPerGameYear / TIME.gameDaysPerYear;

/** Années de jeu écoulées entre deux instants réels (fractionnaire). */
export function gameYearsBetween(fromMs: number, toMs: number): number {
  return Math.max(0, toMs - fromMs) / TIME.realMsPerGameYear;
}

export interface GameAge {
  /** Âge en années entières. */
  years: number;
  /** Jour dans l'année en cours (0 → 364). */
  dayOfYear: number;
  /** Vrai si le personnage a dépassé l'âge max. */
  reachedMaxAge: boolean;
}

/** Âge d'un personnage né (créé) à `createdAtMs`, à l'instant `nowMs`. */
export function ageAt(createdAtMs: number, nowMs: number): GameAge {
  const elapsedYears = gameYearsBetween(createdAtMs, nowMs);
  const exact = TIME.startingAge + elapsedYears;
  const years = Math.floor(exact);
  const dayOfYear = Math.min(
    TIME.gameDaysPerYear - 1,
    Math.floor((exact - years) * TIME.gameDaysPerYear),
  );
  return { years, dayOfYear, reachedMaxAge: exact >= TIME.maxAge };
}

export const REAL_MS_PER_HOUR = 60 * 60 * 1000;
