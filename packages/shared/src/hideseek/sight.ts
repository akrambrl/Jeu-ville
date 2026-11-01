/** Vue des chercheurs : portée limitée, et les bâtiments cachent ce qu'il y a derrière. */
import type { MapGrid } from '../map/grid.js';
import type { TilePoint } from '../map/types.js';

/** Pas d'échantillonnage le long du rayon (cases). */
const SIGHT_STEP = 0.25;

/** Aucun bâtiment entre `a` et `b` (les cases de départ et d'arrivée ne comptent pas). */
export function hasLineOfSight(grid: MapGrid, a: TilePoint, b: TilePoint): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(dist / SIGHT_STEP);
  const from = { x: Math.round(a.x), y: Math.round(a.y) };
  const to = { x: Math.round(b.x), y: Math.round(b.y) };
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    if ((x === from.x && y === from.y) || (x === to.x && y === to.y)) continue;
    if (grid.isBuilding(x, y)) return false;
  }
  return true;
}

/** `viewer` voit `target` : à portée et sans bâtiment entre les deux. */
export function canSee(grid: MapGrid, viewer: TilePoint, target: TilePoint, range: number): boolean {
  if (Math.hypot(target.x - viewer.x, target.y - viewer.y) > range) return false;
  return hasLineOfSight(grid, viewer, target);
}
