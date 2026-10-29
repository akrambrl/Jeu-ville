/**
 * Immobilier : prix, loyers, bonheur du logement, recettes des commerces.
 * Règles pures (config dans balance.ts), appliquées par le serveur et la démo.
 */
import { BUSINESS_PAYOUT_HOURS, BUSINESS_TYPES, REAL_ESTATE } from '../config/balance.js';
import type { PropertySpot } from '../map/types.js';
import { reputationRevenueFactor } from './cooking.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';

export type BusinessType = keyof typeof BUSINESS_TYPES;

const locationFactor = (spot: PropertySpot) => REAL_ESTATE.centralityMin + REAL_ESTATE.centralitySpread * spot.centrality;
const round = (cents: number) => Math.max(REAL_ESTATE.roundingCents, Math.round(cents / REAL_ESTATE.roundingCents) * REAL_ESTATE.roundingCents);

export function salePriceCents(spot: PropertySpot): number {
  return round(REAL_ESTATE[spot.kind].salePerRoomCents * spot.rooms * locationFactor(spot));
}

export function weeklyRentCents(spot: PropertySpot): number {
  // Loyers arrondis à l'euro (ils sont petits).
  return Math.round((REAL_ESTATE[spot.kind].weeklyRentPerRoomCents * spot.rooms * locationFactor(spot)) / 100) * 100;
}

/** Loyer mensuel affiché (arrondi à l'euro) ; il est prélevé chaque jour, au prorata. */
export function monthlyRentCents(spot: PropertySpot): number {
  return Math.round((weeklyRentCents(spot) * REAL_ESTATE.weeksPerMonth) / 100) * 100;
}

/** Loyer prélevé à chaque période (jour réel). Entier, en centimes. */
export function rentPerPeriodCents(spot: PropertySpot): number {
  return Math.round((weeklyRentCents(spot) * REAL_ESTATE.rentPeriodHours) / (7 * 24));
}

/** Nombre de périodes de loyer échues depuis le début du bail (la première se paie à la signature). */
export function rentPeriodsDue(leaseStartMs: number, nowMs: number): number {
  return Math.floor(Math.max(0, nowMs - leaseStartMs) / (REAL_ESTATE.rentPeriodHours * REAL_MS_PER_HOUR)) + 1;
}

/** Bonheur apporté par le logement où l'on habite. */
export function homeHappiness(spot: PropertySpot | null): number {
  return spot ? REAL_ESTATE[spot.kind].happinessPerRoom * spot.rooms : 0;
}

/** Bénéfice versé à chaque période de recettes (heure réelle) par un commerce ouvert ; la réputation l'augmente. */
export function businessPayoutCents(type: BusinessType, spot: PropertySpot, reputation = 0): number {
  const b = BUSINESS_TYPES[type];
  const perDay = b.dailyRevenueCents * (1 - b.chargesShare) * locationFactor(spot) * reputationRevenueFactor(reputation);
  return Math.round((perDay * BUSINESS_PAYOUT_HOURS) / 24);
}

/** Périodes de recettes écoulées depuis l'ouverture. */
export function payoutPeriodsDue(openedAtMs: number, nowMs: number): number {
  return Math.floor(Math.max(0, nowMs - openedAtMs) / (BUSINESS_PAYOUT_HOURS * REAL_MS_PER_HOUR));
}

/** Peut-on déménager ? (une fois toutes les deux semaines) */
export function canMove(lastMoveMs: number | null, nowMs: number): boolean {
  return lastMoveMs === null || nowMs - lastMoveMs >= REAL_ESTATE.moveCooldownDays * 24 * REAL_MS_PER_HOUR;
}
