/** Aller quelque part en bus : destinations autorisées et point de dépose. */
import { TRAVEL } from '../config/balance.js';
import type { MapGrid } from './grid.js';
import { TILE, type DistrictMap, type TilePoint } from './types.js';

/** On ne prend le bus que vers un lieu connu du quartier (entrée d'un lieu, ou chez soi). */
export function isTravelDestination(map: DistrictMap, to: TilePoint, homeDoor: TilePoint | null): boolean {
  if (homeDoor && homeDoor.x === to.x && homeDoor.y === to.y) return true;
  return map.pois.some((p) => p.entrance.x === to.x && p.entrance.y === to.y);
}

/** Case de chaussée la plus proche de `at`, où le bus s'arrête (null s'il n'y en a pas). */
export function curbNear(grid: MapGrid, at: TilePoint, radius: number = TRAVEL.curbSearchRadius): TilePoint | null {
  let best: TilePoint | null = null;
  let bestD = Infinity;
  for (let y = at.y - radius; y <= at.y + radius; y++) {
    for (let x = at.x - radius; x <= at.x + radius; x++) {
      const t = grid.tileAt(x, y);
      if (t !== TILE.road && t !== TILE.majorRoad) continue;
      const d = Math.hypot(x - at.x, y - at.y);
      if (d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Où le bus dépose le joueur pour aller à `to` : la chaussée (`curb`) la plus
 * proche, et la case de trottoir voisine (`door`) la plus proche de la destination.
 */
export function busDropOff(grid: MapGrid, to: TilePoint): { curb: TilePoint; door: TilePoint } {
  const curb = curbNear(grid, to);
  if (!curb) return { curb: to, door: to };
  let door: TilePoint | null = null;
  let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = { x: curb.x + dx, y: curb.y + dy };
      const t = grid.tileAt(p.x, p.y);
      if (!grid.isWalkable(p.x, p.y) || t === TILE.road || t === TILE.majorRoad) continue;
      const d = Math.hypot(p.x - to.x, p.y - to.y);
      if (d < bestD) {
        door = p;
        bestD = d;
      }
    }
  }
  return { curb, door: door ?? curb };
}
