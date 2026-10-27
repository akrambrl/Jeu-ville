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
  /** Gare (bâtiment voyageurs). */
  station: 'J',
  /** Immeuble de la zone d'appartements de départ. */
  starter: 'K',
  /** Cour d'école (praticable). */
  yard: 'Y',
  /** Quai de gare (non praticable, décoratif). */
  platform: 'Q',
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
  /** Drapeau tricolore sur le toit. */
  flag: 'F',
  /** Abri d'arrêt de tram. */
  shelter: 's',
  /** Panier de basket (cour d'école). */
  hoop: 'k',
  /** Marelle peinte au sol (cour d'école). */
  hopscotch: 'm',
  /** Voies ferrées qui traversent une rue (passage à niveau). */
  railCrossing: 'x',
  /**
   * Rails de tram sur la chaussée. Rail selon x près du bord +y (1) ou -y (2),
   * rail selon y près du bord +x (3) ou -x (4), et leurs combinaisons aux carrefours.
   */
  tramXa: '1',
  tramXb: '2',
  tramYa: '3',
  tramYb: '4',
  tramXaYa: '5',
  tramXaYb: '6',
  tramXbYa: '7',
  tramXbYb: '8',
} as const;

/**
 * Forme d'une case de bâtiment (couche `shapes`) : quelle partie du bâtiment elle
 * représente, pour dessiner toits, portes, horloge, enseignes…
 */
export const SHAPE = {
  plain: '.',
  /** Entrée (porte au rez-de-chaussée sur les faces visibles). */
  entrance: 'e',
  /** Toit à deux pans, faîtage selon x : moitié nord / moitié sud (avec porte : 'D'). */
  roofNorth: 'n',
  roofSouth: 's',
  roofSouthDoor: 'D',
  /** Toit à deux pans, faîtage selon y : moitié ouest / moitié est. */
  roofWest: 'w',
  roofEast: 'E',
  /** Mairie : pavillon central (horloge, colonnes, porte). */
  townhallCenter: 'c',
  /** Clocher. */
  belfry: 'b',
  /** Boulangerie au rez-de-chaussée. */
  bakery: 'B',
  /** Enseigne « ÉCOLE ». */
  schoolSign: 'S',
  /** Gare : façade principale avec enseigne RER. */
  stationCenter: 'g',
} as const;

export const WALKABLE_TILES: ReadonlySet<string> = new Set([
  TILE.ground,
  TILE.grass,
  TILE.pedestrian,
  TILE.road,
  TILE.majorRoad,
  TILE.yard,
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
  TILE.station,
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
  kind: 'townhall' | 'station' | 'park' | 'school' | 'worship' | 'market' | 'bakery' | 'tram';
  name: string;
  /** Centre du lieu (pour l'étiquette). */
  x: number;
  y: number;
  /** Case marchable où l'on arrive quand on y va. */
  entrance: TilePoint;
}

export interface Transit {
  /** Tracé du tram (centre des voies), du terminus à l'autre bout. */
  tram: { name: string; path: TilePoint[]; stops: { name: string; at: number }[] } | null;
  /** Voies ferrées : ordonnée (y) de chaque voie, parcourue selon x ; gare (x) où les trains s'arrêtent. */
  rail: { tracks: number[]; stationX: number | null; name: string } | null;
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
  /** Forme des cases de bâtiment (codes SHAPE), mêmes dimensions que `tiles`. */
  shapes: string[];
  /** Lignes de transport animées (purement visuelles pour l'instant). */
  transit: Transit;
  starterBuildings: StarterBuilding[];
  pois: MapPoi[];
  streets: StreetLabel[];
  spawn: TilePoint;
  attribution: string;
  source: { bbox: [number, number, number, number]; fetchedAt: string };
}
