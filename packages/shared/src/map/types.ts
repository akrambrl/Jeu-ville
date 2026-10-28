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
  /** Commissariat de police. */
  police: 'N',
  /** Grande surface. */
  supermarket: 'U',
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
  /** Voiture garée / voiture de police garée. */
  car: 'c',
  policeCar: 'v',
  /** Places de parking peintes au sol. */
  parking: 'p',
  /** Panier de basket (cour d'école). */
  hoop: 'k',
  /** Marelle peinte au sol (cour d'école). */
  hopscotch: 'm',
  /** Voies ferrées qui traversent une rue (passage à niveau). */
  railCrossing: 'x',
  /** Poteau d'arrêt de bus (détails dans `transit.busStops`). */
  busStop: 'u',
  /** Étal de marché (bâche colorée). */
  marketStall: 'q',
  /** Statue sur socle (place). */
  statue: 'j',
  /** Fontaine. */
  fountain: 'o',
  /** But de foot / cage (terrain de sport). */
  goal: 'g',
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
  /** Commerce au rez-de-chaussée (détails dans `storefronts`). */
  storefront: 'B',
  /** Enseigne « ÉCOLE ». */
  schoolSign: 'S',
  /** Gare : façade principale avec enseigne RER. */
  stationCenter: 'g',
  /** Enseigne principale en façade (commissariat, grande surface). */
  facadeSign: 'G',
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
  TILE.police,
  TILE.supermarket,
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
  kind:
    | 'townhall'
    | 'station'
    | 'park'
    | 'school'
    | 'worship'
    | 'market'
    | 'bakery'
    | 'tram'
    | 'pharmacy'
    | 'fastfood'
    | 'police'
    | 'supermarket'
    | 'gym'
    | 'cycles'
    | 'petshop'
    | 'realestate'
    | 'jobcenter'
    | 'square'
    | 'quarter';
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
  /** Lignes de bus : tracé sur les rues (centre de chaussée) et arrêts desservis. */
  bus: BusLine[];
  /** Arrêts de bus : poteau posé sur le trottoir (case `x`,`y`), au bord de la chaussée. */
  busStops: BusStop[];
}

export interface BusLine {
  /** Numéro de ligne (« 105 »). */
  ref: string;
  path: TilePoint[];
  stops: { name: string; at: number }[];
}

export interface BusStop {
  name: string;
  x: number;
  y: number;
  /** Point de la chaussée où le bus s'arrête. */
  curb: TilePoint;
  lines: string[];
}

/** Piste ou bande cyclable le long d'une rue, de (x,y) sur `length` cases selon `axis`. */
export interface Cycleway {
  x: number;
  y: number;
  axis: 'x' | 'y';
  length: number;
}

/** Marchand ambulant (maïs grillé, marrons chauds) : on lui achète à manger à côté de lui. */
export interface StreetVendor {
  id: string;
  kind: 'corn' | 'chestnut';
  x: number;
  y: number;
  /** Case vers laquelle il est tourné (le passage). */
  facing: TilePoint;
}

/**
 * Bien proposé par l'agence immobilière : appartement, maison ou local commercial.
 * Repéré par l'import de carte ; prix et loyers sont calculés par la config (formulas/realEstate).
 */
export interface PropertySpot {
  /** Identifiant stable dans le quartier (« apt-12-8-s-2 », « house-34-51 », « local-80-66 »). */
  id: string;
  kind: 'apartment' | 'house' | 'local';
  name: string;
  /** Case marchable devant l'entrée (là où l'on rentre chez soi, ou où l'on ouvre boutique). */
  door: TilePoint;
  /** Case de façade (enseigne d'un commerce ouvert dans un local). */
  facade: TilePoint;
  /** Pièces (logements) ; 1 pour un local. */
  rooms: number;
  /** 1 = à côté de la mairie, 0 = au bout du quartier : fait varier les prix et la clientèle. */
  centrality: number;
}

/** Texte d'enseigne de façade (SHAPE.schoolSign / facadeSign) quand il diffère du texte par défaut. */
export interface FacadeSign {
  x: number;
  y: number;
  text: string;
}

/** Devanture d'un commerce au rez-de-chaussée d'un immeuble. */
export interface Storefront {
  x: number;
  y: number;
  kind: 'bakery' | 'pharmacy' | 'fastfood' | 'police' | 'cycles' | 'petshop' | 'realestate' | 'jobcenter';
  /** Texte de l'enseigne (en capitales). */
  sign: string;
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
  /** Devantures des cases SHAPE.storefront. */
  storefronts: Storefront[];
  /** Lignes de transport animées (purement visuelles pour l'instant). */
  transit: Transit;
  cycleways: Cycleway[];
  vendors: StreetVendor[];
  signs: FacadeSign[];
  /** Biens de l'agence immobilière. */
  properties: PropertySpot[];
  starterBuildings: StarterBuilding[];
  pois: MapPoi[];
  streets: StreetLabel[];
  spawn: TilePoint;
  attribution: string;
  source: { bbox: [number, number, number, number]; fetchedAt: string };
}
