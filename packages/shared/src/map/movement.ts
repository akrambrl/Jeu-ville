import type { TilePoint } from './types.js';

export interface Mover {
  x: number;
  y: number;
  dir: number;
  /** Cases restantes à parcourir, la prochaine en tête. */
  path: TilePoint[];
}

/** Direction 0→7 à partir d'un déplacement (0 = +x, sens horaire par 45°). */
export function directionOf(dx: number, dy: number, fallback: number): number {
  if (dx === 0 && dy === 0) return fallback;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return (octant + 8) % 8;
}

/** Fait avancer `mover` de `distance` cases le long de son chemin. */
export function advance(mover: Mover, distance: number): void {
  let remaining = distance;
  while (remaining > 0 && mover.path.length > 0) {
    const target = mover.path[0]!;
    const dx = target.x - mover.x;
    const dy = target.y - mover.y;
    const dist = Math.hypot(dx, dy);
    mover.dir = directionOf(dx, dy, mover.dir);
    if (dist <= remaining) {
      mover.x = target.x;
      mover.y = target.y;
      mover.path.shift();
      remaining -= dist;
    } else {
      mover.x += (dx / dist) * remaining;
      mover.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}
