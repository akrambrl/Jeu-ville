/**
 * Une case = une personne. Chaque personnage (joueur ou bot) tient la case où
 * il se trouve et réserve la suivante avant d'y entrer ; s'il ne peut pas, il
 * attend. Utilisé par le serveur (room) et par la démo solo.
 */
import { MOVEMENT } from '../config/balance.js';
import type { MapGrid } from './grid.js';
import { findPath } from './pathfinding.js';
import { directionOf, type Mover } from './movement.js';
import type { TilePoint } from './types.js';

const key = (x: number, y: number) => `${x},${y}`;

export class TileOccupancy {
  private readonly owners = new Map<string, string>();
  private readonly held = new Map<string, Set<string>>();
  private readonly fixed = new Set<string>();

  /** Case occupée en permanence (stand d'un marchand ambulant…). */
  block(x: number, y: number): void {
    this.fixed.add(key(x, y));
  }

  /** Libre pour `id` : personne d'autre ne la tient. */
  isFree(x: number, y: number, id?: string): boolean {
    const k = key(x, y);
    if (this.fixed.has(k)) return false;
    const owner = this.owners.get(k);
    return owner === undefined || owner === id;
  }

  tryHold(id: string, x: number, y: number): boolean {
    if (!this.isFree(x, y, id)) return false;
    const k = key(x, y);
    this.owners.set(k, id);
    let set = this.held.get(id);
    if (!set) this.held.set(id, (set = new Set()));
    set.add(k);
    return true;
  }

  holds(id: string, x: number, y: number): boolean {
    return this.owners.get(key(x, y)) === id;
  }

  release(id: string, x: number, y: number): void {
    const k = key(x, y);
    if (this.owners.get(k) !== id) return;
    this.owners.delete(k);
    this.held.get(id)?.delete(k);
  }

  releaseAll(id: string): void {
    for (const k of this.held.get(id) ?? []) this.owners.delete(k);
    this.held.delete(id);
  }
}

/** Personnage soumis à l'occupation des cases. */
export interface Walker extends Mover {
  id: string;
  /** Case tenue (là où il est, ou d'où il part). */
  tile: TilePoint;
  /** Temps passé bloqué derrière quelqu'un (ms). */
  blockedMs: number;
}

/** Case libre la plus proche de `p` (p elle-même si libre), dans un rayon donné. */
export function nearestFreeTile(
  grid: MapGrid,
  occ: TileOccupancy,
  p: TilePoint,
  id?: string,
  radius: number = MOVEMENT.freeTileSearchRadius,
): TilePoint | null {
  let best: TilePoint | null = null;
  let bestD = Infinity;
  for (let y = p.y - radius; y <= p.y + radius; y++) {
    for (let x = p.x - radius; x <= p.x + radius; x++) {
      if (!grid.isWalkable(x, y) || !occ.isFree(x, y, id)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Avance d'au plus `distance` cases ; ne quitte sa case que si la suivante a pu
 * être réservée. Renvoie true si le personnage est bloqué.
 */
export function advanceAvoiding(w: Walker, distance: number, occ: TileOccupancy): boolean {
  let remaining = distance;
  while (remaining > 0 && w.path.length > 0) {
    const next = w.path[0]!;
    const entering = next.x !== w.tile.x || next.y !== w.tile.y;
    if (entering && !occ.tryHold(w.id, next.x, next.y)) return true;
    const dx = next.x - w.x;
    const dy = next.y - w.y;
    const dist = Math.hypot(dx, dy);
    w.dir = directionOf(dx, dy, w.dir);
    if (dist <= remaining) {
      w.x = next.x;
      w.y = next.y;
      w.path.shift();
      remaining -= dist;
      if (entering) {
        occ.release(w.id, w.tile.x, w.tile.y);
        w.tile = { x: next.x, y: next.y };
      }
    } else {
      w.x += (dx / dist) * remaining;
      w.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
  return false;
}

/** Chemin vers `goal` qui contourne les cases tenues par les autres (null : aucun). */
export function pathAvoiding(grid: MapGrid, occ: TileOccupancy, w: Walker, goal: TilePoint, maxLength: number = MOVEMENT.maxPathLength): TilePoint[] | null {
  // Si l'on a déjà réservé la case suivante, on y va d'abord (on est en chemin).
  const next = w.path[0];
  const from = next && occ.holds(w.id, next.x, next.y) && (next.x !== w.tile.x || next.y !== w.tile.y) ? next : w.tile;
  const rest = findPath(grid, from, goal, maxLength, (x, y) => !occ.isFree(x, y, w.id));
  if (!rest) return null;
  return from === w.tile ? rest : [from, ...rest];
}

/**
 * Un pas de simulation : avance, et gère les blocages (contournement, puis abandon).
 * Renvoie true si le personnage est en mouvement (ou attend pour avancer).
 */
export function stepWalker(grid: MapGrid, occ: TileOccupancy, w: Walker, distance: number, dtMs: number): boolean {
  if (w.path.length === 0) return false;
  if (!advanceAvoiding(w, distance, occ)) {
    w.blockedMs = 0;
    return w.path.length > 0;
  }
  w.blockedMs += dtMs;
  const goal = w.path.at(-1)!;
  if (w.blockedMs >= MOVEMENT.blockedGiveUpMs) {
    w.path = [];
    w.blockedMs = 0;
    return false;
  }
  const R = MOVEMENT.blockedRepathMs;
  if (Math.floor(w.blockedMs / R) > Math.floor((w.blockedMs - dtMs) / R)) {
    // Destination prise entre-temps : on vise la case libre la plus proche.
    const target = occ.isFree(goal.x, goal.y, w.id) ? goal : nearestFreeTile(grid, occ, goal, w.id);
    const detour = target ? pathAvoiding(grid, occ, w, target) : null;
    if (detour) w.path = detour;
  }
  return true;
}
