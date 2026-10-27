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
  townhall: 'O',
  worship: 'V',
  industrial: 'I',
  /** Immeuble de la zone d'appartements de départ. */
  starter: 'K',
} as const;

export type TileCode = (typeof TILE)[keyof typeof TILE];

/** Décor posé sur une case (couche `decor`) : purement visuel, ne bloque pas. */
export const DECOR = {
  none: '.',
  tree: 't',
  lamp: 'l',
  bench: 'b',
  flowers: 'f',
  /** Marquage central d'une rue orientée selon x (sur le bord +y de la case). */
  laneX: '-',
  laneY: '|',
  /** Passage piéton sur une rue orientée selon x / y. */
  crossingX: 'z',
  crossingY: 'Z',
} as const;

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
  TILE.townhall,
  TILE.worship,
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
  /** Centre du lieu (pour l'étiquette). */
  x: number;
  y: number;
  /** Case marchable où l'on arrive quand on y va. */
  entrance: TilePoint;
}

/** Nom de rue écrit sur la chaussée. */
export interface StreetLabel {
  name: string;
  x: number;
  y: number;
  axis: 'x' | 'y';
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
  /** Couche de décor (codes DECOR), mêmes dimensions que `tiles`. */
  decor: string[];
  starterBuildings: StarterBuilding[];
  pois: MapPoi[];
  streets: StreetLabel[];
  spawn: TilePoint;
  attribution: string;
  source: { bbox: [number, number, number, number]; fetchedAt: string };
}
