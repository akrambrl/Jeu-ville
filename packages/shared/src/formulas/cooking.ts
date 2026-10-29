/**
 * Cuisine (mini-jeux du comptoir de son propre commerce) : notes des gestes,
 * étoiles, pourboire, réputation. Règles pures, appliquées par le serveur et la démo ;
 * le client s'en sert pour noter les gestes et l'afficher.
 */
import { COOKING, RECIPES, type Recipe } from '../config/cooking.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Plats d'un type de commerce (vide s'il ne sert pas à manger). */
export function recipesFor(businessType: string): readonly Recipe[] {
  return (RECIPES as Record<string, readonly Recipe[] | undefined>)[businessType] ?? [];
}

export function findRecipe(businessType: string, dishId: string): Recipe | undefined {
  return recipesFor(businessType).find((r) => r.id === dishId);
}

/** Plat commandé par le client suivant. */
export function pickDish(businessType: string, rand: () => number): Recipe | undefined {
  const list = recipesFor(businessType);
  return list[Math.floor(rand() * list.length)];
}

/** Couper, remuer, tapoter : part du compte demandé atteinte. */
export function countScore(done: number, needed: number): number {
  return needed <= 0 ? 1 : clamp01(done / needed);
}

/** Toucher au bon moment : 1 au centre de la zone verte, 0 loin d'elle. */
export function timingScore(cursor: number, zoneCenter: number): number {
  const off = Math.abs(cursor - zoneCenter);
  if (off <= COOKING.timingZone) return 1;
  return clamp01(1 - (off - COOKING.timingZone) / (COOKING.timingZone * 3));
}

/** Verser : 1 pile au trait, 0 au-delà de la tolérance. */
export function pourScore(level: number): number {
  return clamp01(1 - Math.abs(level - COOKING.pourTarget) / COOKING.pourTolerance);
}

/** Monter le plat : ingrédients bien placés, chaque erreur en retire un. */
export function assembleScore(placed: number, total: number, mistakes: number): number {
  return total <= 0 ? 1 : clamp01((placed - mistakes) / total);
}

/** Note d'un plat : 1 à 3 étoiles selon la moyenne des étapes. */
export function cookStars(scores: readonly number[]): 1 | 2 | 3 {
  if (scores.length === 0) return 1;
  const avg = scores.reduce((a, b) => a + clamp01(b), 0) / scores.length;
  const [two, three] = COOKING.starThresholds;
  return avg >= three ? 3 : avg >= two ? 2 : 1;
}

/** Part du pourboire gagnée (0 à 1) selon les étoiles. */
export function tipShare(stars: 1 | 2 | 3): number {
  return COOKING.tipShareByStars[stars - 1]!;
}

/**
 * Le plat envoyé par le client est-il plausible ? Bon plat, une note par étape
 * (entre 0 et 1), et pas plus vite qu'un humain ne le peut.
 */
export function validCooking(recipe: Recipe, scores: readonly number[], elapsedMs: number): boolean {
  return (
    scores.length === recipe.steps.length &&
    scores.every((s) => Number.isFinite(s) && s >= 0 && s <= 1) &&
    elapsedMs >= recipe.steps.length * COOKING.minStepMs
  );
}

/** Nouvelle réputation (0 à 100, entière) après un plat noté `stars`. */
export function nextReputation(reputation: number, stars: 1 | 2 | 3): number {
  const target = COOKING.reputation.targetByStars[stars - 1]!;
  if (reputation === target) return target;
  const moved = Math.round(reputation + (target - reputation) * COOKING.reputation.pull);
  // Toujours au moins un point vers la cible, sans la dépasser.
  return target > reputation ? Math.min(target, Math.max(moved, reputation + 1)) : Math.max(target, Math.min(moved, reputation - 1));
}

/** Multiplicateur de la recette quotidienne selon la réputation (1 à 1 + bonus max). */
export function reputationRevenueFactor(reputation: number): number {
  return 1 + COOKING.reputation.maxRevenueBonus * (clamp01(reputation / 100));
}

/** Étoiles de réputation à afficher (0 à 5). */
export function reputationStars(reputation: number): number {
  return Math.round(clamp01(reputation / 100) * 5);
}
