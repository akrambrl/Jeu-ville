/**
 * Le cache-cache se joue sur un seul quartier : on découpe un rectangle de la
 * carte OSM et on recale toutes les coordonnées (la case (0,0) devient le coin
 * haut-gauche du quartier). Le reste du code (grille, A*, vue 3D) fonctionne
 * tel quel sur cette sous-carte.
 */
import { HIDE_SEEK } from '../config/hideSeek.js';
import { getDistrictMap } from '../map/registry.js';
import type { DistrictMap, TilePoint } from '../map/types.js';

export interface ArenaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sous-carte `bounds` de `map`, coordonnées recalées ; ce qui sort du cadre est retiré. */
export function cropDistrictMap(map: DistrictMap, bounds: ArenaBounds, districtName = map.districtName): DistrictMap {
  const x0 = Math.max(0, bounds.x);
  const y0 = Math.max(0, bounds.y);
  const width = Math.min(bounds.width, map.width - x0);
  const height = Math.min(bounds.height, map.height - y0);
  const inside = (p: TilePoint) => p.x >= x0 && p.y >= y0 && p.x < x0 + width && p.y < y0 + height;
  const shift = <T extends TilePoint>(p: T): T => ({ ...p, x: p.x - x0, y: p.y - y0 });
  const rows = (layer: string[]) => layer.slice(y0, y0 + height).map((r) => r.slice(x0, x0 + width));
  const spawn = inside(map.spawn) ? shift(map.spawn) : { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  return {
    ...map,
    districtName,
    width,
    height,
    tiles: rows(map.tiles),
    levels: rows(map.levels),
    decor: rows(map.decor),
    shapes: rows(map.shapes),
    storefronts: map.storefronts.filter(inside).map(shift),
    busyStreets: map.busyStreets
      .map((s) => ({ ...s, sidewalks: s.sidewalks.filter(inside).map(shift) }))
      .filter((s) => s.sidewalks.length > 0),
    // Les lignes de transport traversent le cadre : on ne les anime pas dans le quartier.
    transit: { tram: null, rail: null, bus: [], busStops: [] },
    cycleways: map.cycleways.filter(inside).map(shift),
    vendors: map.vendors.filter(inside).map((v) => ({ ...shift(v), facing: shift(v.facing) })),
    signs: map.signs.filter(inside).map(shift),
    properties: map.properties
      .filter((p) => inside(p.door) && inside(p.facade))
      .map((p) => ({ ...p, door: shift(p.door), facade: shift(p.facade) })),
    starterBuildings: map.starterBuildings.filter((b) => inside(b.door)).map((b) => ({ ...b, door: shift(b.door) })),
    pois: map.pois.filter((p) => inside(p)).map((p) => ({ ...shift(p), entrance: shift(p.entrance) })),
    streets: map.streets.filter(inside).map(shift),
    spawn,
  };
}

export interface Arena {
  /** Sous-carte du quartier joué. */
  map: DistrictMap;
  /** Point de départ (place Jeanne-d'Arc), en coordonnées du quartier. */
  start: TilePoint;
}

let cached: Arena | null = null;

/** Le quartier du cache-cache (voir HIDE_SEEK.arena). */
export function getArena(): Arena {
  if (cached) return cached;
  const cfg = HIDE_SEEK.arena;
  const full = getDistrictMap(cfg.districtKey);
  if (!full) throw new Error(`Quartier inconnu : ${cfg.districtKey}`);
  const map = cropDistrictMap(full, cfg.bounds, cfg.name);
  const start = { x: cfg.start.x - cfg.bounds.x, y: cfg.start.y - cfg.bounds.y };
  // Pas de marchands ambulants : on ne doit pas les prendre pour des joueurs.
  cached = { map: { ...map, spawn: start, vendors: [] }, start };
  return cached;
}
