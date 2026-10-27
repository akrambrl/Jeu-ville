import type { MapGrid } from './grid.js';
import type { TilePoint } from './types.js';

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Distance octile : heuristique admissible pour 8 directions. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** File de priorité minimale (tas binaire) sur des indices de case. */
class MinHeap {
  private readonly items: number[] = [];
  constructor(private readonly score: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  push(i: number): void {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.score[a[p]!]! <= this.score[i]!) break;
      a[k] = a[p]!;
      k = p;
    }
    a[k] = i;
  }

  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      let k = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && this.score[a[r]!]! < this.score[a[l]!]! ? r : l;
        if (this.score[a[c]!]! >= this.score[last]!) break;
        a[k] = a[c]!;
        k = c;
      }
      a[k] = last;
    }
    return top;
  }
}

/**
 * A* sur la grille, 8 directions, sans couper les coins de bâtiments.
 * Renvoie la liste des cases de `start` (exclu) à `goal` (inclus),
 * [] si on y est déjà, ou null si inaccessible.
 */
export function findPath(
  grid: MapGrid,
  start: TilePoint,
  goal: TilePoint,
  maxLength = Infinity,
): TilePoint[] | null {
  if (!grid.isWalkable(start.x, start.y) || !grid.isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const w = grid.width;
  const size = w * grid.height;
  const g = new Float64Array(size).fill(Infinity);
  const f = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap(f);

  const startIdx = start.y * w + start.x;
  const goalIdx = goal.y * w + goal.x;
  g[startIdx] = 0;
  f[startIdx] = octile(start.x, start.y, goal.x, goal.y);
  open.push(startIdx);

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIdx) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % w;
    const cy = (current - cx) / w;
    const gc = g[current]!;
    if (gc > maxLength) continue;

    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.isWalkable(nx, ny)) continue;
      // Pas de diagonale qui frôle un obstacle.
      if (dx !== 0 && dy !== 0 && (!grid.isWalkable(cx + dx, cy) || !grid.isWalkable(cx, cy + dy))) {
        continue;
      }
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const tentative = gc + cost;
      if (tentative < g[ni]!) {
        g[ni] = tentative;
        f[ni] = tentative + octile(nx, ny, goal.x, goal.y);
        cameFrom[ni] = current;
        open.push(ni);
      }
    }
  }

  if (cameFrom[goalIdx] === -1) return null;

  const path: TilePoint[] = [];
  for (let i = goalIdx; i !== startIdx; i = cameFrom[i]!) {
    path.push({ x: i % w, y: Math.floor(i / w) });
  }
  return path.reverse();
}
