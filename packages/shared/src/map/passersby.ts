/**
 * Passants : des bots qui se promènent (certains avec leur chien), en respectant
 * « une personne par case ». Même logique sur le serveur et dans la démo solo.
 */
import { MOVEMENT, PASSERBY } from '../config/balance.js';
import type { MapGrid } from './grid.js';
import { pathAvoiding, stepWalker, type TileOccupancy, type Walker } from './occupancy.js';
import type { TilePoint } from './types.js';

export interface PasserbyLook {
  sex: 'male' | 'female';
  baseLook: number;
  skinTone: number;
  hairColor: number;
  bodyType: number;
}

export interface Passerby extends Walker {
  speed: number;
  /** Instant (ms) où il repart. */
  restUntil: number;
  look: PasserbyLook;
  /** Animal promené (« dog:2 » = chien, robe n°2), ou '' . */
  pet: string;
  /** Flâneur d'une rue commerçante (index dans `busyStreets`) : il y reste. */
  zone?: number;
}

/** Robes de chien disponibles (voir le rendu côté client). */
export const DOG_COATS = 4;

/** Cases praticables reliées à `from` (pas les cours fermées) : où les passants peuvent aller. */
export function reachableTiles(grid: MapGrid, from: TilePoint): TilePoint[] {
  const out: TilePoint[] = [];
  const seen = new Uint8Array(grid.width * grid.height);
  const queue: TilePoint[] = [from];
  seen[from.y * grid.width + from.x] = 1;
  while (queue.length > 0) {
    const p = queue.pop()!;
    out.push(p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (grid.isWalkable(n.x, n.y) && !seen[n.y * grid.width + n.x]) {
        seen[n.y * grid.width + n.x] = 1;
        queue.push(n);
      }
    }
  }
  return out;
}

export function spawnPasserby(
  id: string,
  occ: TileOccupancy,
  tiles: TilePoint[],
  nowMs: number,
  rand: () => number = Math.random,
  zone?: number,
): Passerby {
  // Une case libre au hasard (quelques essais), sinon la première libre.
  let p: TilePoint | undefined;
  for (let tries = 0; tries < 20 && !p; tries++) {
    const t = tiles[Math.floor(rand() * tiles.length)]!;
    if (occ.tryHold(id, t.x, t.y)) p = t;
  }
  p ??= tiles.find((t) => occ.tryHold(id, t.x, t.y));
  if (!p) throw new Error('Plus aucune case libre pour un passant.');
  return {
    id,
    x: p.x,
    y: p.y,
    dir: 2,
    path: [],
    tile: { ...p },
    blockedMs: 0,
    speed: MOVEMENT.walkTilesPerSecond * PASSERBY.speedFactor,
    restUntil: nowMs + rand() * PASSERBY.restMs[1],
    look: {
      sex: rand() < 0.5 ? 'male' : 'female',
      baseLook: Math.floor(rand() * 6),
      skinTone: Math.floor(rand() * 6),
      hairColor: Math.floor(rand() * 6),
      bodyType: Math.floor(rand() * 3),
    },
    pet: rand() < PASSERBY.dogShare ? `dog:${Math.floor(rand() * DOG_COATS)}` : '',
    ...(zone !== undefined ? { zone } : {}),
  };
}

/** Un pas de vie d'un passant : choisir une destination proche, marcher, se reposer. */
export function updatePasserby(
  grid: MapGrid,
  occ: TileOccupancy,
  b: Passerby,
  dtMs: number,
  nowMs: number,
  rand: () => number = Math.random,
): void {
  if (b.path.length === 0 && nowMs >= b.restUntil) {
    const zone = b.zone !== undefined ? grid.map.busyStreets[b.zone]?.sidewalks : undefined;
    const target = zone ? pickInZone(zone, b.tile, rand) : pickNear(grid, b.tile, rand);
    const path = target && occ.isFree(target.x, target.y, b.id) ? pathAvoiding(grid, occ, b, target, PASSERBY.maxPathLength) : null;
    if (path) b.path = path;
    b.restUntil = nowMs + PASSERBY.restMs[0] + rand() * (PASSERBY.restMs[1] - PASSERBY.restMs[0]);
  }
  if (b.path.length === 0) return;
  stepWalker(grid, occ, b, (b.speed * dtMs) / 1000, dtMs);
  if (b.path.length === 0) b.restUntil = nowMs + PASSERBY.restMs[0] + rand() * (PASSERBY.restMs[1] - PASSERBY.restMs[0]);
}

/** Rue commerçante : une autre case de trottoir pas trop loin (on va de vitrine en vitrine). */
function pickInZone(zone: TilePoint[], from: TilePoint, rand: () => number): TilePoint | null {
  for (let tries = 0; tries < 12; tries++) {
    const t = zone[Math.floor(rand() * zone.length)]!;
    const d = Math.hypot(t.x - from.x, t.y - from.y);
    if (d >= 2 && d <= PASSERBY.busyTargetRadius) return t;
  }
  return null;
}

function pickNear(grid: MapGrid, from: TilePoint, rand: () => number): TilePoint | null {
  for (let tries = 0; tries < 12; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 3 + rand() * (PASSERBY.targetRadius - 3);
    const t = { x: Math.round(from.x + Math.cos(a) * r), y: Math.round(from.y + Math.sin(a) * r) };
    if (grid.isWalkable(t.x, t.y)) return t;
  }
  return null;
}
