/**
 * Métiers : offres d'emploi (employeurs bots de la carte), niveaux, paie des
 * missions, commandes du comptoir. Règles pures, appliquées par le serveur et la démo.
 */
import { COUNTER_ITEMS, JOBS, MOVEMENT } from '../config/balance.js';
import type { DistrictMap, TilePoint } from '../map/types.js';

export type JobType = 'courier' | 'counter';
export const JOB_TYPES: JobType[] = ['courier', 'counter'];

export interface Employer {
  id: string;
  name: string;
  jobType: JobType;
  /** Là où l'on prend son service. */
  door: TilePoint;
}

/** Offres d'emploi du quartier : chaque commerce bot qui recrute. */
export function employers(map: DistrictMap): Employer[] {
  const out: Employer[] = [];
  for (const p of map.pois) {
    for (const jobType of JOB_TYPES) {
      if (!(JOBS[jobType].employers as readonly string[]).includes(p.kind)) continue;
      out.push({ id: `${p.kind}-${p.entrance.x}-${p.entrance.y}`, name: p.name, jobType, door: p.entrance });
    }
  }
  return out;
}

/** Niveau (1…) selon l'expérience. */
export function jobLevel(xp: number): number {
  let level = 1;
  JOBS.levelXp.forEach((needed, k) => {
    if (xp >= needed) level = k + 1;
  });
  return level;
}

export function jobTitle(type: JobType, xp: number): string {
  return `${JOBS[type].label} ${JOBS.levelTitles[jobLevel(xp) - 1]}`;
}

/** Paie d'une mission réussie (avec ou sans pourboire), selon le niveau. Entier, en centimes. */
export function missionPayCents(type: JobType, xp: number, withTip: boolean): number {
  const job = JOBS[type];
  const raise = 1 + JOBS.payRaisePerLevel * (jobLevel(xp) - 1);
  return Math.round((job.payCents + (withTip ? job.tipCents : 0)) * raise);
}

export function canBeHired(appearance: number): boolean {
  return appearance >= JOBS.minAppearanceToHire;
}

/** Délai accordé pour une livraison de `distance` cases (ms). */
export function deliveryDeadlineMs(distance: number): number {
  return (distance / MOVEMENT.walkTilesPerSecond) * 1000 * JOBS.courier.deadlineFactor + JOBS.courier.deadlineBonusMs;
}

/** Commande d'un client du comptoir : 2 à 4 articles (identifiants de COUNTER_ITEMS). */
export function counterOrder(rand: () => number): string[] {
  const [min, max] = JOBS.counter.orderSize;
  const size = min + Math.floor(rand() * (max - min + 1));
  return Array.from({ length: size }, () => COUNTER_ITEMS[Math.floor(rand() * COUNTER_ITEMS.length)]!.id);
}

/** Bonne commande servie ? (l'ordre des articles ne compte pas). */
export function sameOrder(asked: string[], served: string[]): boolean {
  if (asked.length !== served.length) return false;
  const a = [...asked].sort();
  const b = [...served].sort();
  return a.every((x, k) => x === b[k]);
}
