/** Grille de test minimale (tests unitaires uniquement). */
import { MapGrid } from './grid.js';
import type { DistrictMap } from './types.js';

export function makeGrid(rows: string[]): MapGrid {
  const map: DistrictMap = {
    cityId: 'test',
    cityName: 'Test',
    districtId: 'test',
    districtName: 'Test',
    width: rows[0]!.length,
    height: rows.length,
    cellSizeMeters: 8,
    tiles: rows,
    levels: rows.map((r) => '0'.repeat(r.length)),
    decor: rows.map((r) => '.'.repeat(r.length)),
    shapes: rows.map((r) => '.'.repeat(r.length)),
    storefronts: [],
    transit: { tram: null, rail: null, bus: [], busStops: [] },
    cycleways: [],
    vendors: [],
    signs: [],
    starterBuildings: [],
    pois: [],
    streets: [],
    spawn: { x: 0, y: 0 },
    attribution: '',
    source: { bbox: [0, 0, 0, 0], fetchedAt: '' },
  };
  return new MapGrid(map);
}
