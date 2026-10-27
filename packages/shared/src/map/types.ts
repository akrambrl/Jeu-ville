/**
 * Format des cartes de quartier, générées hors ligne depuis OpenStreetMap
 * par `tools/osm-import`.
 */

/** Codes de case (un caractère par case dans `tiles`). */
export const TILE = {
  ground: '.',
  grass: 'G',
  pedestrian: 'P',
  road: 'R',
  majorRoad: 'M',
  water: 'W',
  rail: 'T',
  building: 'B',
  house: 'H',
  apartments: 'A',
  commercial: 'C',
  civic: 'S',
  industrial: 'I',
  /** Immeuble de la zone d'appartements de départ. */
  starter: 'K',
} as const;

export type TileCode = (typeof TILE)[keyof typeof TILE];

export const WALKABLE_TILES: ReadonlySet<string> = new Set([
  TILE.ground,
  TILE.grass,
  TILE.pedestrian,
  TILE.road,
  TILE.majorRoad,
]);

export const BUILDING_TILES: ReadonlySet<string> = new Set([
  TILE.building,
  TILE.house,
  TILE.apartments,
  TILE.commercial,
  TILE.civic,
  TILE.industrial,
  TILE.starter,
]);

export interface TilePoint {
  x: number;
  y: number;
}

export interface StarterBuilding {
  id: string;
  name: string;
  levels: number;
  /** Case marchable devant l'entrée. */
  door: TilePoint;
}

export interface MapPoi {
  kind: 'townhall' | 'station' | 'park' | 'school' | 'worship' | 'market';
  name: string;
  x: number;
  y: number;
}

export interface DistrictMap {
  cityId: string;
  cityName: string;
  districtId: string;
  districtName: string;
  width: number;
  height: number;
  cellSizeMeters: number;
  /** `height` lignes de `width` caractères (codes TILE). */
  tiles: string[];
  /** Nombre d'étages par case ('0' hors bâtiment, '1'→'9'). */
  levels: string[];
  starterBuildings: StarterBuilding[];
  pois: MapPoi[];
  spawn: TilePoint;
  attribution: string;
  source: { bbox: [number, number, number, number]; fetchedAt: string };
}
