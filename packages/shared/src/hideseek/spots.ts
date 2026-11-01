/**
 * Cachettes du cache-cache, déduites de la carte du quartier (déterministe :
 * le serveur et tous les clients obtiennent exactement la même liste).
 */
import { HIDE_SEEK, type HidingSpotKind } from '../config/hideSeek.js';
import { DECOR, TILE, type DistrictMap, type TilePoint } from '../map/types.js';
import { MapGrid } from '../map/grid.js';
import { reachableTiles } from '../map/passersby.js';

export interface HidingSpot {
  id: string;
  kind: HidingSpotKind;
  /** Case de l'objet (poubelle, voiture, rampe) ou de la porte (bâtiment). */
  x: number;
  y: number;
  /** Case praticable d'où l'on y entre. */
  access: TilePoint;
  /** Voiture : axe de la rue ; porte : direction de la façade (vers la case d'accès). */
  axis: 'x' | 'y';
}

/** Les objets posés sur une case praticable la bloquent (on les contourne). */
export function spotBlocksTile(spot: HidingSpot): boolean {
  return spot.kind === 'trash' || spot.kind === 'car' || spot.kind === 'parking';
}

const RESIDENTIAL = new Set<string>([TILE.apartments, TILE.starter]);
const BUILT = new Set<string>([TILE.apartments, TILE.starter, TILE.house, TILE.commercial, TILE.building]);
const ENTRANCES = new Set(['e', 'D']);
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Ordre pseudo-aléatoire mais stable, pour répartir les cachettes dans tout le quartier. */
const scatter = (p: TilePoint) => (((p.x * 73856093) ^ (p.y * 19349663)) >>> 0) % 100_003;

interface Candidate {
  x: number;
  y: number;
  access: TilePoint;
  axis: 'x' | 'y';
}

export function hidingSpots(map: DistrictMap, start: TilePoint = map.spawn): HidingSpot[] {
  const grid = new MapGrid(map);
  const reachable = new Set(reachableTiles(grid, start).map((p) => `${p.x},${p.y}`));
  const isReachable = (x: number, y: number) => reachable.has(`${x},${y}`);
  const tile = (x: number, y: number) => grid.tileAt(x, y);
  const road = (x: number, y: number) => tile(x, y) === TILE.road || tile(x, y) === TILE.majorRoad;
  const candidates: Record<HidingSpotKind, Candidate[]> = { trash: [], car: [], hall: [], stairwell: [], parking: [] };

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const t = tile(x, y);
      const decor = grid.decorAt(x, y);
      if (RESIDENTIAL.has(t)) {
        // Porte d'immeuble : hall si c'est l'entrée, cage d'escalier (porte de service) sinon.
        for (const [dx, dy] of N4) {
          const ax = x + dx;
          const ay = y + dy;
          if (!isReachable(ax, ay)) continue;
          const c = { x, y, access: { x: ax, y: ay }, axis: dx !== 0 ? ('x' as const) : ('y' as const) };
          (ENTRANCES.has(grid.shapeAt(x, y)) ? candidates.hall : candidates.stairwell).push(c);
          break;
        }
        continue;
      }
      if (!isReachable(x, y)) continue;
      if (t === TILE.pedestrian && decor === DECOR.none) {
        // Poubelle : trottoir le long d'un immeuble, contournable par la case d'en face.
        for (const [dx, dy] of N4) {
          if (!BUILT.has(tile(x + dx, y + dy)) || !isReachable(x - dx, y - dy)) continue;
          candidates.trash.push({ x, y, access: { x: x - dx, y: y - dy }, axis: dx !== 0 ? 'x' : 'y' });
          break;
        }
      }
      if (road(x, y) && decor !== DECOR.crossingX && decor !== DECOR.crossingY) {
        // Voiture garée : file de chaussée le long du trottoir, l'autre file reste libre.
        for (const [dx, dy] of N4) {
          if (tile(x + dx, y + dy) !== TILE.pedestrian || !road(x - dx, y - dy)) continue;
          // Pas dans un carrefour : la rue continue des deux côtés le long du trottoir.
          const ux = dy;
          const uy = dx;
          if (!road(x + ux, y + uy) || !road(x - ux, y - uy)) break;
          if (road(x + dx + ux, y + dy + uy) || road(x + dx - ux, y + dy - uy)) break;
          candidates.car.push({ x, y, access: { x: x + dx, y: y + dy }, axis: dx !== 0 ? 'y' : 'x' });
          break;
        }
      }
      if (decor === DECOR.parking || (t === TILE.grass && decor === DECOR.none)) {
        // Rampe de parking souterrain : sur un parking, ou sur une pelouse au bord de la rue près des immeubles.
        const nearHomes = [-2, -1, 0, 1, 2].some((dy) => [-2, -1, 0, 1, 2].some((dx) => RESIDENTIAL.has(tile(x + dx, y + dy))));
        if (decor !== DECOR.parking && !nearHomes) continue;
        for (const [dx, dy] of N4) {
          if (!(road(x + dx, y + dy) || tile(x + dx, y + dy) === TILE.pedestrian) || !isReachable(x - dx, y - dy)) continue;
          // Les parkings peints passent en premier.
          const c = { x, y, access: { x: x + dx, y: y + dy }, axis: dx !== 0 ? ('x' as const) : ('y' as const) };
          if (decor === DECOR.parking) candidates.parking.unshift(c);
          else candidates.parking.push(c);
          break;
        }
      }
    }
  }

  const spots: HidingSpot[] = [];
  const order: HidingSpotKind[] = ['parking', 'hall', 'stairwell', 'car', 'trash'];
  const taken = new Set<string>();
  for (const kind of order) {
    const { spacing, max } = HIDE_SEEK.spots[kind];
    const list = kind === 'parking' ? candidates.parking : [...candidates[kind]].sort((a, b) => scatter(a) - scatter(b));
    const mine: HidingSpot[] = [];
    for (const c of list) {
      if (mine.length >= max) break;
      if (mine.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < spacing)) continue;
      // Pas deux cachettes collées, ni une cachette sur l'accès d'une autre.
      if (spots.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 2 || (s.access.x === c.x && s.access.y === c.y))) continue;
      if (spotBlocksTile({ kind } as HidingSpot) && taken.has(`${c.access.x},${c.access.y}`)) continue;
      const spot: HidingSpot = { id: `${kind}-${c.x}-${c.y}`, kind, x: c.x, y: c.y, access: c.access, axis: c.axis };
      mine.push(spot);
      spots.push(spot);
      if (spotBlocksTile(spot)) taken.add(`${c.x},${c.y}`);
    }
  }
  // Une cachette qui bloque ne doit pas se trouver sur l'accès d'une autre.
  return spots.filter((s) => !spots.some((o) => spotBlocksTile(o) && o !== s && o.x === s.access.x && o.y === s.access.y));
}
