/**
 * Transforme la carte OSM brute en PLAN SCHÉMATISÉ jouable :
 * - une grille régulière de rues droites (pas `PITCH` cases) ; un tronçon devient
 *   une vraie rue (avec son nom réel) si une rue OSM passe à cet endroit, sinon
 *   une coulée verte praticable à pied ;
 * - des îlots propres dont le type (pavillons, immeubles, cité, commerces,
 *   square, mairie, église, école, gare…) reprend le caractère réel du quartier ;
 * - les lieux connus (mairie, gare RER, arrêts de tram, boulangeries…) gardent
 *   leur nom et leur position approximative ;
 * - le faisceau ferré et la ligne de tram réels, simplifiés sur la grille.
 */
import {
  CITY_LIMITS,
  DECOR,
  SHAPE,
  TILE,
  type BusLine,
  type BusStop,
  type Cycleway,
  type DistrictMap,
  type FacadeSign,
  WALKABLE_TILES,
  type MapPoi,
  type PropertySpot,
  type Religion,
  type StreetVendor,
  type StarterBuilding,
  type Storefront,
  type StreetLabel,
  type TilePoint,
  type Transit,
} from '@jeu-ville/shared';
import type { DistrictSource } from './districts.js';
import { nearestNamed, type Pt } from './raster.js';

/** Pas de la grille : 2 cases de rue + un îlot de 8 cases (trottoirs compris). */
const PITCH = 10;
const BLOCK = PITCH - 2;
/** Part minimale d'un tronçon couverte par une rue OSM pour devenir une rue. */
const STREET_COVERAGE = 0.5;
/** Idem pour le tram (ses voies OSM sont souvent découpées en petits morceaux). */
const TRAM_COVERAGE = 0.35;
/** Distance max (en cases) entre une rue OSM et la ligne de grille qui la représente. */
const SNAP_DISTANCE = PITCH * 0.4;
/** Part de voies ferrées dans une rangée d'îlots pour en faire le faisceau ferré. */
const RAIL_ROW_MIN_SHARE = 0.12;
/** Franchissements minimum du faisceau ferré (ponts / passages à niveau). */
const MIN_RAIL_CROSSINGS = 2;
const STARTER_BLOCKS = 3;
const MAX_SCHOOLS = 40;
const MAX_BAKERIES = 3;
const MAX_FAST_FOODS = 8;
const MAX_SUPERMARKETS = 3;
const MAX_SQUARES = 5;
const MAX_GYMS = 4;
/** Part minimale d'un tronçon couverte par une piste ou bande cyclable OSM. */
const BIKE_COVERAGE = 0.4;
/** Distance max (en cases) entre un arrêt de bus réel et la rue qui le dessert. */
const BUS_STOP_SNAP = PITCH * 1.2;
/** Marchands ambulants : quoi, près de quel lieu, combien. */
const VENDORS: { kind: StreetVendor['kind']; near: MapPoi['kind']; count: number }[] = [
  { kind: 'corn', near: 'station', count: 2 },
  { kind: 'corn', near: 'tram', count: 1 },
  { kind: 'chestnut', near: 'station', count: 1 },
  { kind: 'chestnut', near: 'tram', count: 1 },
  { kind: 'chestnut', near: 'townhall', count: 1 },
];
const VENDOR_SEARCH_RADIUS = 6;
/** Commerces de rez-de-chaussée par îlot, au plus. */
const MAX_STOREFRONTS_PER_BLOCK = 3;
/** Un lieu qui ne trouve pas son îlot (déjà pris) se cherche une place jusqu'à cette distance (en îlots). */
const POI_SEARCH_BLOCKS = 2;
/** Idem pour les commerces de rez-de-chaussée (il leur faut un immeuble). */
const STOREFRONT_SEARCH_BLOCKS = 3;

type Side = 'n' | 's' | 'e' | 'w';
/** Îlots qui deviennent des immeubles à boutiques au bord d'une rue commerçante. */
const MAINSTREET_FROM = new Set<string>(['houses', 'gardens', 'apartments', 'tower', 'shops']);
/** Boutiques d'une rue commerçante, dans l'ordre où elles se succèdent. */
const SHOP_MIX: { kind: Storefront['kind']; sign: string; eat?: string }[] = [
  { kind: 'butcher', sign: 'BOUCHERIE' },
  { kind: 'kebab', sign: 'KEBAB', eat: 'Kebab du boulevard' },
  { kind: 'taxiphone', sign: 'TAXIPHONE' },
  { kind: 'cafe', sign: 'CAFÉ' },
  { kind: 'hairdresser', sign: 'COIFFURE' },
  { kind: 'grocery', sign: 'PRIMEUR' },
  { kind: 'restaurant', sign: 'RESTAURANT', eat: 'Restaurant du boulevard' },
  { kind: 'phone', sign: 'TÉLÉPHONIE' },
  { kind: 'bazaar', sign: 'BAZAR' },
  { kind: 'kebab', sign: 'TACOS', eat: 'Tacos du boulevard' },
  { kind: 'grocery', sign: 'ÉPICERIE' },
  { kind: 'hairdresser', sign: 'BARBIER' },
  { kind: 'restaurant', sign: 'PIZZERIA', eat: 'Pizzeria du boulevard' },
  { kind: 'butcher', sign: 'BOUCHERIE' },
  { kind: 'cafe', sign: 'BRASSERIE' },
  { kind: 'taxiphone', sign: 'TRANSFERT' },
];

/**
 * Pas de marques déposées dans le jeu (ces commerces deviendront rachetables
 * par des joueurs) : les enseignes de chaînes prennent un nom générique.
 */
function displayName(p: RawPoi): string {
  // Coquilles fréquentes dans OSM.
  if (!p.brand) return p.name.replace(/martenelle/i, 'maternelle');
  const cuisine = p.cuisine ?? '';
  if (p.kind === 'supermarket') return 'Supermarché';
  if (/pizza/.test(cuisine)) return 'Pizzeria';
  if (/mexican|tacos/.test(cuisine)) return 'Tacos';
  if (/chicken/.test(cuisine)) return 'Poulet frit';
  if (/burger/.test(cuisine)) return 'Burger';
  return 'Restauration rapide';
}

/** Texte de l'enseigne d'un fast-food selon sa cuisine. */
function fastFoodSign(p: RawPoi): string {
  const c = p.cuisine ?? '';
  if (/kebab/.test(c)) return 'KEBAB';
  if (/pizza/.test(c)) return 'PIZZA';
  if (/mexican|tacos/.test(c)) return 'TACOS';
  if (/chicken/.test(c)) return 'CHICKEN';
  if (/burger/.test(c)) return 'BURGER';
  return 'SNACK';
}

/** Façades où un hall d'immeuble peut donner sur la rue. */
const BUILDING_CODES = new Set<string>([TILE.apartments, TILE.commercial]);

const isCommissariat = (p: RawPoi) => p.kind === 'police' && !/municipale/i.test(p.name);

type SchoolLevel = 'maternelle' | 'primaire' | 'college' | 'lycee';
function schoolLevel(p: RawPoi): SchoolLevel {
  const s = `${p.school ?? ''} ${p.name}`.toLowerCase();
  if (/lycée/.test(s)) return 'lycee';
  if (/collège|secondaire|enseignement général/.test(s)) return 'college';
  if (/maternelle|martenelle/.test(s)) return 'maternelle';
  return 'primaire';
}
const SCHOOL_SIGNS: Record<SchoolLevel, string> = {
  maternelle: 'ÉCOLE MATERNELLE',
  primaire: 'ÉCOLE',
  college: 'COLLÈGE',
  lycee: 'LYCÉE',
};

/** Enseigne des lieux de culte sans clocher ni minaret. */
const WORSHIP_SIGNS: Record<Exclude<Religion, 'christian' | 'muslim'>, string> = {
  jewish: 'SYNAGOGUE',
  buddhist: 'TEMPLE',
  other: 'LIEU DE CULTE',
};

const STREET_CLASSES: Record<string, string> = {
  primary: TILE.majorRoad,
  secondary: TILE.majorRoad,
  tertiary: TILE.majorRoad,
  residential: TILE.road,
  unclassified: TILE.road,
  living_street: TILE.road,
  pedestrian: TILE.pedestrian,
};

export interface RawRoad {
  name?: string;
  highway: string;
  pts: Pt[];
}

export interface RawPoi {
  kind: MapPoi['kind'];
  name: string;
  x: number;
  y: number;
  brand?: string;
  cuisine?: string;
  /** Type d'établissement scolaire (tag `school:FR`). */
  school?: string;
  /** Lieu de culte : religion (tag `religion`). */
  religion?: Religion;
  /** Rue réelle du lieu (adresse OSM, sinon la rue la plus proche). */
  street?: string;
}

export interface RawBusStop {
  name: string;
  x: number;
  y: number;
}

export interface RawBusRoute {
  ref: string;
  /** Noms des arrêts dans l'ordre de la ligne. */
  stopNames: string[];
}

/** Carte OSM rastérisée (cases de 8 m), voir build.ts. */
export interface RawRaster {
  width: number;
  height: number;
  tiles: string[];
  levels: Uint8Array;
  roads: RawRoad[];
  trams: { name: string; pts: Pt[] }[];
  pois: RawPoi[];
  busStops: RawBusStop[];
  busRoutes: RawBusRoute[];
  bikeWays: Pt[][];
}

type BlockKind =
  | 'houses'
  | 'gardens'
  | 'apartments'
  | 'tower'
  | 'shops'
  | 'park'
  | 'townhall'
  | 'worship'
  | 'school'
  | 'station'
  | 'police'
  | 'supermarket'
  | 'market'
  | 'plaza'
  | 'gym'
  | 'mainstreet'
  | 'rail';

interface Edge {
  votes: number;
  tramVotes: number;
  bikeVotes: number;
  names: Map<string, number>;
  code: string;
  street: boolean;
  tram: boolean;
  /** Tronçon qui traverse le faisceau ferré. */
  railCrossing: boolean;
}

/** Hachage déterministe pour varier les détails sans aléatoire. */
function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ (v + 0x9e3779b9), 16777619);
  return (h >>> 0) / 4294967296;
}

export function schematize(d: DistrictSource, raw: RawRaster): DistrictMap {
  const nx = Math.floor((raw.width - 2) / PITCH);
  const ny = Math.floor((raw.height - 2) / PITCH);
  const width = nx * PITCH + 2;
  const height = ny * PITCH + 2;

  const tiles: string[] = new Array(width * height).fill(TILE.grass);
  const levels = new Uint8Array(width * height);
  const decor: string[] = new Array(width * height).fill(DECOR.none);
  const shapes: string[] = new Array(width * height).fill(SHAPE.plain);
  const set = (x: number, y: number, code: string, lv = 0) => {
    tiles[y * width + x] = code;
    levels[y * width + x] = lv;
  };
  const setDecor = (x: number, y: number, c: string) => {
    decor[y * width + x] = c;
  };
  const setShape = (x: number, y: number, c: string) => {
    shapes[y * width + x] = c;
  };
  const tileAt = (x: number, y: number) => tiles[y * width + x];

  // ---------- 0. Faisceau ferré : la rangée d'îlots la plus couverte de voies ----------
  // S'il y a une gare, on cherche autour d'elle : c'est là que passent les voies principales.

  const stationPoi = raw.pois.find((p) => p.kind === 'station');
  const stationRow = stationPoi ? Math.floor((stationPoi.y - 2) / PITCH) : null;
  let railRow: number | null = null;
  let bestShare = RAIL_ROW_MIN_SHARE;
  for (let j = 0; j < ny; j++) {
    if (stationRow !== null && Math.abs(j - stationRow) > 1) continue;
    let rail = 0;
    let total = 0;
    for (let y = j * PITCH; y < (j + 1) * PITCH + 2 && y < raw.height; y++) {
      for (let x = 0; x < width && x < raw.width; x++) {
        total++;
        if (raw.tiles[y]?.[x] === TILE.rail) rail++;
      }
    }
    if (total > 0 && rail / total > bestShare) {
      bestShare = rail / total;
      railRow = j;
    }
  }

  // ---------- 1. Rues et tram : vote des voies OSM sur les tronçons de la grille ----------

  const newEdge = (): Edge => ({
    votes: 0,
    tramVotes: 0,
    bikeVotes: 0,
    names: new Map(),
    code: TILE.road,
    street: false,
    tram: false,
    railCrossing: false,
  });
  /** hEdges[j][i] : ligne horizontale j, entre les nœuds i et i+1. */
  const hEdges = Array.from({ length: ny + 1 }, () => Array.from({ length: nx }, newEdge));
  const vEdges = Array.from({ length: nx + 1 }, () => Array.from({ length: ny }, newEdge));
  const rank = (code: string) => (code === TILE.majorRoad ? 2 : code === TILE.road ? 1 : 0);

  /** Projette une polyligne OSM sur les tronçons de grille qu'elle longe. */
  const vote = (pts: Pt[], onEdge: (edge: Edge, length: number) => void) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 0.5));
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        // Les lignes de rue sont centrées entre les cases kP et kP+1, soit en kP+1.
        const along = horizontal ? x : y;
        const across = horizontal ? y : x;
        const line = Math.round((across - 1) / PITCH);
        const segment = Math.floor((along - 1) / PITCH);
        if (Math.abs(across - (line * PITCH + 1)) > SNAP_DISTANCE) continue;
        const edge = horizontal ? hEdges[line]?.[segment] : vEdges[line]?.[segment];
        if (edge) onEdge(edge, len / steps);
      }
    }
  };

  for (const road of raw.roads) {
    const code = STREET_CLASSES[road.highway];
    if (!code) continue;
    vote(road.pts, (edge, l) => {
      const first = edge.votes === 0;
      edge.votes += l;
      if (road.name) edge.names.set(road.name, (edge.names.get(road.name) ?? 0) + l);
      if (first || rank(code) > rank(edge.code)) edge.code = code;
    });
  }
  const tramName = raw.trams[0]?.name ?? 'Tram';
  for (const tram of raw.trams) vote(tram.pts, (edge, l) => (edge.tramVotes += l));
  for (const bike of raw.bikeWays) vote(bike, (edge, l) => (edge.bikeVotes += l));

  const allEdges = [...hEdges.flat(), ...vEdges.flat()];
  for (const e of allEdges) {
    e.street = e.votes >= PITCH * STREET_COVERAGE;
    e.tram = e.tramVotes >= PITCH * TRAM_COVERAGE;
    // Le tram circule sur la chaussée : son tronçon est forcément une rue.
    if (e.tram && !e.street) {
      e.street = true;
      e.code = TILE.road;
    }
    if (e.tram && e.code === TILE.pedestrian) e.code = TILE.road;
  }

  // Le faisceau ferré coupe la ville : seuls quelques tronçons verticaux le traversent.
  if (railRow !== null) {
    const crossings = vEdges.map((col, i) => ({ i, e: col[railRow!]! }));
    for (const c of crossings) c.e.railCrossing = c.e.street;
    const count = crossings.filter((c) => c.e.railCrossing).length;
    if (count < MIN_RAIL_CROSSINGS) {
      // On ajoute les franchissements les plus « votés » (vraies rues à proximité).
      for (const c of [...crossings].sort((a, b) => b.e.votes - a.e.votes).slice(0, MIN_RAIL_CROSSINGS - count)) {
        c.e.street = true;
        c.e.railCrossing = true;
      }
    }
  }

  // Supprime les bouts de rue isolés (aucune rue voisine à leurs deux extrémités).
  const streetAt = (h: boolean, line: number, seg: number) =>
    (h ? hEdges[line]?.[seg] : vEdges[line]?.[seg])?.street ?? false;
  const nodeDegree = (i: number, j: number) =>
    Number(streetAt(true, j, i - 1)) + Number(streetAt(true, j, i)) + Number(streetAt(false, i, j - 1)) + Number(streetAt(false, i, j));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const e = hEdges[j]![i]!;
      if (e.street && !e.tram && nodeDegree(i, j) === 1 && nodeDegree(i + 1, j) === 1) e.street = false;
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const e = vEdges[i]![j]!;
      if (e.street && !e.tram && !e.railCrossing && nodeDegree(i, j) === 1 && nodeDegree(i, j + 1) === 1) e.street = false;
    }
  }

  const edgeName = (e: Edge | undefined): string | null => {
    if (!e?.street) return null;
    let best: [string, number] | null = null;
    for (const entry of e.names) if (!best || entry[1] > best[1]) best = entry;
    return best?.[0] ?? null;
  };

  // Tracé des rues et coulées vertes.
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const e = hEdges[j]![i]!;
      const y0 = j * PITCH;
      for (let x = i * PITCH + 2; x < (i + 1) * PITCH; x++) {
        const end = x === i * PITCH + 2 || x === (i + 1) * PITCH - 1;
        for (const y of [y0, y0 + 1]) {
          // Hors rue : coulée verte (toujours praticable à pied).
          set(x, y, e.street ? e.code : TILE.grass);
          if (!e.street || e.code === TILE.pedestrian) continue;
          if (e.tram) setDecor(x, y, y === y0 ? DECOR.tramXa : DECOR.tramXb);
          else setDecor(x, y, end ? DECOR.crossingX : y === y0 ? DECOR.laneX : DECOR.none);
        }
      }
      if (!e.street) setDecor(i * PITCH + 5, y0 + (hash(i, j, 1) < 0.5 ? 0 : 1), DECOR.tree);
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const e = vEdges[i]![j]!;
      const x0 = i * PITCH;
      const inCorridor = railRow === j;
      for (let y = j * PITCH + 2; y < (j + 1) * PITCH; y++) {
        const end = y === j * PITCH + 2 || y === (j + 1) * PITCH - 1;
        for (const x of [x0, x0 + 1]) {
          if (inCorridor && !e.railCrossing) {
            set(x, y, TILE.rail);
            continue;
          }
          set(x, y, e.street ? e.code : TILE.grass);
          if (!e.street || e.code === TILE.pedestrian) continue;
          if (e.tram) setDecor(x, y, x === x0 ? DECOR.tramYa : DECOR.tramYb);
          else if (inCorridor) setDecor(x, y, DECOR.railCrossing);
          else setDecor(x, y, end ? DECOR.crossingY : x === x0 ? DECOR.laneY : DECOR.none);
        }
      }
      if (!e.street && !inCorridor) setDecor(x0 + (hash(i, j, 2) < 0.5 ? 0 : 1), j * PITCH + 5, DECOR.tree);
    }
  }
  // Carrefours : chaussée si une rue y arrive ; rails de tram dans le sens de ses tronçons.
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const west = hEdges[j]?.[i - 1];
      const east = hEdges[j]?.[i];
      const north = vEdges[i]?.[j - 1];
      const south = vEdges[i]?.[j];
      const incident = [west, east, north, south].filter((e) => e?.street && e.code !== TILE.pedestrian);
      const code = incident.length === 0 ? TILE.grass : incident.some((e) => e!.code === TILE.majorRoad) ? TILE.majorRoad : TILE.road;
      const tramX = !!(west?.tram || east?.tram);
      const tramY = !!(north?.tram || south?.tram);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const x = i * PITCH + dx;
        const y = j * PITCH + dy;
        set(x, y, code);
        if (!tramX && !tramY) continue;
        const xa = dy === 0;
        const ya = dx === 0;
        let c: string;
        if (tramX && tramY) {
          c = xa ? (ya ? DECOR.tramXaYa : DECOR.tramXaYb) : ya ? DECOR.tramXbYa : DECOR.tramXbYb;
        } else if (tramX) c = xa ? DECOR.tramXa : DECOR.tramXb;
        else c = ya ? DECOR.tramYa : DECOR.tramYb;
        setDecor(x, y, c);
      }
    }
  }

  // ---------- 2. Caractère de chaque îlot d'après la carte réelle ----------

  const kinds: BlockKind[][] = [];
  const avgLevels: number[][] = [];
  for (let j = 0; j < ny; j++) {
    kinds.push([]);
    avgLevels.push([]);
    for (let i = 0; i < nx; i++) {
      const c = { building: 0, green: 0, house: 0, apart: 0, shop: 0, levels: 0, total: 0 };
      for (let y = j * PITCH; y < (j + 1) * PITCH + 2 && y < raw.height; y++) {
        for (let x = i * PITCH; x < (i + 1) * PITCH + 2 && x < raw.width; x++) {
          const t = raw.tiles[y]?.[x] ?? TILE.ground;
          c.total++;
          if (t === TILE.grass) c.green++;
          if ('BHACSIK'.includes(t)) {
            c.building++;
            c.levels += raw.levels[y * raw.width + x] ?? 0;
            if (t === TILE.house) c.house++;
            if (t === TILE.apartments || t === TILE.starter) c.apart++;
            if (t === TILE.commercial) c.shop++;
          }
        }
      }
      const lv = c.building > 0 ? c.levels / c.building : 0;
      avgLevels[j]!.push(lv);
      let kind: BlockKind;
      if (j === railRow) kind = 'rail';
      else if (c.green / c.total >= 0.3) kind = 'park';
      else if (c.building / c.total < 0.12) kind = 'gardens';
      else if (c.shop >= 0.3 * c.building) kind = 'shops';
      else if (c.apart >= c.house && lv >= 5.5) kind = 'tower';
      else if (c.apart >= c.house) kind = 'apartments';
      else kind = 'houses';
      kinds[j]!.push(kind);
    }
  }

  // Cités : îlots d'habitation bâtis en tours et en barres.
  const [minLon, , , maxLat] = d.bbox;
  const lonSpan = d.bbox[2] - minLon;
  const latSpan = maxLat - d.bbox[1];
  for (const estate of d.estates ?? []) {
    const [eMinLon, eMinLat, eMaxLon, eMaxLat] = estate.bbox;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const lon = minLon + (((i + 0.5) * PITCH + 1) / raw.width) * lonSpan;
        const lat = maxLat - (((j + 0.5) * PITCH + 1) / raw.height) * latSpan;
        if (lon < eMinLon || lon > eMaxLon || lat < eMinLat || lat > eMaxLat) continue;
        if (!['houses', 'gardens', 'apartments', 'shops', 'park'].includes(kinds[j]![i]!)) continue;
        kinds[j]![i] = (i + j) % 3 === 0 ? 'apartments' : 'tower';
      }
    }
  }

  // Lieux notables qui occupent un îlot entier (le leur, ou un voisin libre).
  const BLOCK_POIS: Partial<Record<MapPoi['kind'], BlockKind>> = {
    townhall: 'townhall',
    station: 'station',
    worship: 'worship',
    school: 'school',
    park: 'park',
    police: 'police',
    supermarket: 'supermarket',
    market: 'market',
    square: 'plaza',
    gym: 'gym',
  };
  const priority: MapPoi['kind'][] = ['townhall', 'station', 'police', 'supermarket', 'market', 'square', 'worship', 'school', 'gym', 'park'];
  const schoolsFirst = (p: RawPoi) => (/collège|groupe scolaire/i.test(p.name) ? 0 : 1);
  const sortedPois = raw.pois
    // La police municipale est un simple bureau au rez-de-chaussée, pas un îlot.
    .filter((p) => BLOCK_POIS[p.kind] && (p.kind !== 'police' || isCommissariat(p)))
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || schoolsFirst(a) - schoolsFirst(b));
  const claimed = new Map<string, RawPoi>();
  const counts = new Map<MapPoi['kind'], number>();
  const limits: Partial<Record<MapPoi['kind'], number>> = {
    school: MAX_SCHOOLS,
    supermarket: MAX_SUPERMARKETS,
    police: CITY_LIMITS.policeStations,
    square: MAX_SQUARES,
    gym: MAX_GYMS,
    market: 1,
  };
  for (const p of sortedPois) {
    if ((counts.get(p.kind) ?? 0) >= (limits[p.kind] ?? Infinity)) continue;
    let ci = Math.min(nx - 1, Math.max(0, Math.floor(p.x / PITCH)));
    let cj = Math.min(ny - 1, Math.max(0, Math.floor(p.y / PITCH)));
    // Écoles d'un même groupe scolaire (maternelle + élémentaire côte à côte) : un seul îlot.
    if (p.kind === 'school' && claimed.get(`${ci},${cj}`)?.kind === 'school') continue;
    // La gare se place juste au sud du faisceau ferré, face aux voies.
    if (p.kind === 'station' && railRow !== null) cj = Math.min(ny - 1, railRow + 1);
    // L'îlot du lieu réel, puis les plus proches autour (jusqu'à 2 îlots de distance).
    const spots: [number, number][] = [];
    for (let dj = -POI_SEARCH_BLOCKS; dj <= POI_SEARCH_BLOCKS; dj++) {
      for (let di = -POI_SEARCH_BLOCKS; di <= POI_SEARCH_BLOCKS; di++) spots.push([ci + di, cj + dj]);
    }
    spots.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));
    const free = spots.find(
      ([i, j]) => i >= 0 && j >= 0 && i < nx && j < ny && j !== railRow && !claimed.has(`${i},${j}`),
    );
    if (!free) continue;
    [ci, cj] = free;
    claimed.set(`${ci},${cj}`, p);
    counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    kinds[cj]![ci] = BLOCK_POIS[p.kind]!;
  }

  // Rues commerçantes : les îlots ordinaires qui les bordent deviennent des immeubles à boutiques.
  const highStreets = new Set(d.highStreets ?? []);
  const mainSides = new Map<string, { side: Side; street: string }[]>();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const sides: { side: Side; street: string }[] = [];
      for (const [side, e] of [['s', hEdges[j + 1]?.[i]], ['e', vEdges[i + 1]?.[j]], ['n', hEdges[j]?.[i]], ['w', vEdges[i]?.[j]]] as const) {
        const street = edgeName(e);
        if (street && highStreets.has(street)) sides.push({ side, street });
      }
      if (sides.length === 0 || claimed.has(`${i},${j}`) || !MAINSTREET_FROM.has(kinds[j]![i]!)) continue;
      kinds[j]![i] = 'mainstreet';
      mainSides.set(`${i},${j}`, sides);
    }
  }

  // ---------- 3. Remplissage des îlots ----------

  const pois: MapPoi[] = [];
  const signs: FacadeSign[] = [];
  const starterCandidates: { i: number; j: number }[] = [];
  let stationX: number | null = null;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ox = i * PITCH + 2;
      const oy = j * PITCH + 2;
      const kind = kinds[j]![i]!;
      const r = (salt: number) => hash(i, j, salt);
      const at = (lx: number, ly: number, code: string, lv = 0) => set(ox + lx, oy + ly, code, lv);
      const deco = (lx: number, ly: number, c: string) => setDecor(ox + lx, oy + ly, c);
      const shape = (lx: number, ly: number, c: string) => setShape(ox + lx, oy + ly, c);
      const fill = (x0: number, y0: number, x1: number, y1: number, code: string, lv = 0) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) at(x, y, code, lv);
      };
      /** Maison 2×2 avec toit à deux pans (faîtage selon x) et porte au sud. */
      const house = (x: number, y: number, lv: number) => {
        fill(x, y, x + 1, y + 1, TILE.house, lv);
        shape(x, y, SHAPE.roofNorth);
        shape(x + 1, y, SHAPE.roofNorth);
        shape(x, y + 1, SHAPE.roofSouthDoor);
        shape(x + 1, y + 1, SHAPE.roofSouth);
      };
      const poiHere = claimed.get(`${i},${j}`);
      const addPoi = (center: TilePoint, entrance: TilePoint, name?: string) => {
        if (!poiHere) return;
        pois.push({
          kind: poiHere.kind,
          name: name ?? displayName(poiHere),
          x: ox + center.x,
          y: oy + center.y,
          entrance: { x: ox + entrance.x, y: oy + entrance.y },
          ...(poiHere.religion ? { religion: poiHere.religion } : {}),
        });
      };

      if (kind === 'rail') {
        // Faisceau : 6 voies, 2 quais. Rien n'est praticable, sauf les franchissements.
        for (let y = 0; y < BLOCK; y++) {
          for (let x = -2; x < BLOCK; x++) {
            if (x < 0 && vEdges[i]![j]!.railCrossing) continue;
            at(x, y, y === 2 || y === 5 ? TILE.platform : TILE.rail);
          }
        }
        if (i === nx - 1) {
          // Dernière colonne : voies jusqu'au bord de la carte.
          for (let y = 0; y < BLOCK; y++) for (const x of [BLOCK, BLOCK + 1]) if (!vEdges[nx]![j]!.railCrossing) at(x, y, TILE.rail);
        }
        continue;
      }

      // Trottoir tout autour, avec quelques arbres et un lampadaire.
      fill(0, 0, BLOCK - 1, BLOCK - 1, TILE.pedestrian);
      deco(0, 0, DECOR.lamp);
      deco(BLOCK - 1, BLOCK - 1, DECOR.lamp);
      if (kind !== 'park') {
        deco(0, 4, DECOR.tree);
        deco(BLOCK - 1, 5, DECOR.tree);
      }

      switch (kind) {
        case 'houses':
        case 'gardens': {
          fill(1, 1, 6, 6, TILE.grass);
          // Plusieurs dispositions de pavillons, choisies par îlot.
          const layouts: [number, number][][] =
            kind === 'gardens'
              ? [[[1, 1], [5, 5]], [[1, 5], [5, 1]]]
              : [
                  [[1, 1], [5, 1], [1, 5], [5, 5]],
                  [[1, 1], [3, 1], [5, 1], [1, 5]],
                  [[1, 1], [5, 1], [3, 5]],
                  [[1, 1], [1, 4], [5, 1], [5, 4]],
                ];
          const layout = layouts[Math.floor(r(5) * layouts.length)]!;
          layout.forEach(([x, y], k) => house(x, y, 1 + (r(k) < 0.6 ? 1 : 0)));
          for (const [x, y, c] of [[3, 3, DECOR.tree], [4, 4, DECOR.flowers], [6, 3, DECOR.tree], [2, 6, DECOR.flowers]] as const) {
            if (tileAt(ox + x, oy + y) === TILE.grass) deco(x, y, c);
          }
          break;
        }
        case 'apartments': {
          const lv = Math.min(6, Math.max(4, Math.round(avgLevels[j]![i]!) + (r(3) < 0.5 ? 0 : 1)));
          fill(1, 1, 6, 6, TILE.grass);
          const variant = Math.floor(r(6) * 3);
          for (let y = 1; y <= 6; y++) {
            for (let x = 1; x <= 6; x++) {
              const built =
                variant === 0
                  ? // Immeubles autour d'une cour, ouverte au sud.
                    (x <= 2 || x >= 5 || y <= 2 || y >= 5) && !((x === 3 || x === 4) && y >= 5)
                  : variant === 1
                    ? // Deux barres parallèles.
                      y <= 2 || y >= 5
                    : // En L.
                      x <= 2 || y <= 2;
              if (built) at(x, y, TILE.apartments, lv);
            }
          }
          // Halls d'entrée côté rue (sud et est), face à la caméra.
          shape(2, 6, SHAPE.entrance);
          shape(6, 2, SHAPE.entrance);
          deco(4, 4, DECOR.tree);
          deco(3, 4, DECOR.bench);
          starterCandidates.push({ i, j });
          break;
        }
        case 'mainstreet': {
          // Immeubles de rapport autour d'une cour, halls d'entrée au sud et à l'est.
          // Côté nord ou ouest, la caméra ne voit pas la façade : boutiques en rez-de-chaussée
          // bas devant un immeuble moins haut, pour que leurs enseignes drapeau dépassent.
          const sides = (mainSides.get(`${i},${j}`) ?? []).map((m) => m.side);
          const hidden = sides.includes('n') || sides.includes('w');
          const lv = hidden ? 3 : 4 + (r(3) < 0.5 ? 0 : 1);
          fill(1, 1, 6, 6, TILE.grass);
          for (let y = 1; y <= 6; y++) {
            for (let x = 1; x <= 6; x++) {
              if (!(x <= 2 || x >= 5 || y <= 2 || y >= 5)) continue;
              const annex = (sides.includes('n') && y === 1) || (sides.includes('w') && x === 1);
              at(x, y, TILE.apartments, annex ? 1 : lv);
            }
          }
          shape(2, 6, SHAPE.entrance);
          shape(6, 2, SHAPE.entrance);
          deco(3, 3, DECOR.tree);
          break;
        }
        case 'tower': {
          fill(1, 1, 6, 6, TILE.grass);
          fill(1, 1, 6, 2, TILE.apartments, 7 + (r(4) < 0.5 ? 0 : 1));
          fill(5, 4, 6, 6, TILE.apartments, 6);
          shape(6, 2, SHAPE.entrance);
          shape(5, 6, SHAPE.entrance);
          deco(2, 4, DECOR.tree);
          deco(3, 6, DECOR.tree);
          deco(2, 6, DECOR.bench);
          break;
        }
        case 'shops': {
          fill(1, 1, 6, 6, TILE.pedestrian);
          // Commerces sur 2 ou 3 niveaux, vitrines sur rue.
          const shop = (salt: number) => 2 + (r(salt) < 0.3 ? 1 : 0);
          for (let k = 1; k <= 6; k++) {
            at(k, 1, TILE.commercial, shop(10 + k));
            at(1, k, TILE.commercial, shop(20 + k));
            at(6, k, TILE.commercial, shop(30 + k));
            if (k !== 3 && k !== 4) at(k, 6, TILE.commercial, shop(40 + k));
          }
          deco(3, 3, DECOR.tree);
          deco(4, 3, DECOR.bench);
          break;
        }
        case 'park': {
          fill(0, 0, BLOCK - 1, BLOCK - 1, TILE.grass);
          fill(3, 0, 4, BLOCK - 1, TILE.pedestrian);
          fill(0, 3, BLOCK - 1, 4, TILE.pedestrian);
          for (let y = 0; y < BLOCK; y++) {
            for (let x = 0; x < BLOCK; x++) {
              if (tileAt(ox + x, oy + y) !== TILE.grass) continue;
              const v = r(100 + y * BLOCK + x);
              if (v < 0.35) deco(x, y, DECOR.tree);
              else if (v < 0.5) deco(x, y, DECOR.flowers);
            }
          }
          deco(2, 3, DECOR.bench);
          deco(5, 4, DECOR.bench);
          addPoi({ x: 3, y: 3 }, { x: 3, y: 3 });
          break;
        }
        case 'townhall': {
          // Mairie : deux ailes à toit d'ardoise, pavillon central plus haut avec
          // horloge, colonnes, porte et drapeau ; parvis fleuri devant.
          fill(1, 1, 2, 4, TILE.townhall, 2);
          fill(4, 1, 5, 4, TILE.townhall, 2);
          fill(3, 1, 3, 4, TILE.townhall, 3);
          shape(3, 4, SHAPE.townhallCenter);
          deco(3, 4, DECOR.flag);
          for (const x of [1, 5]) deco(x, 6, DECOR.flowers);
          deco(6, 5, DECOR.tree);
          deco(6, 2, DECOR.tree);
          deco(2, 6, DECOR.bench);
          addPoi({ x: 3, y: 2 }, { x: 3, y: 5 });
          break;
        }
        case 'worship': {
          const religion = poiHere?.religion;
          if (religion === 'muslim') {
            // Mosquée : salle de prière carrée, coupole au centre, minaret à l'angle.
            fill(2, 1, 5, 4, TILE.worship, 2);
            shape(3, 2, SHAPE.dome);
            at(6, 1, TILE.worship, 2);
            shape(6, 1, SHAPE.minaret);
            fill(2, 5, 5, 5, TILE.worship, 1);
            shape(3, 5, SHAPE.facadeSign);
            signs.push({ x: ox + 3, y: oy + 5, text: 'MOSQUÉE' });
            shape(4, 5, SHAPE.entrance);
            deco(1, 6, DECOR.tree);
            deco(6, 6, DECOR.bench);
            addPoi({ x: 3, y: 3 }, { x: 4, y: 6 });
            break;
          }
          if (religion === 'jewish' || religion === 'buddhist' || religion === 'other') {
            // Synagogue, temple… : édifice à toit en brisis, sans clocher, enseigne en façade.
            fill(2, 1, 5, 4, TILE.worship, 3);
            fill(2, 5, 5, 5, TILE.worship, 2);
            shape(3, 5, SHAPE.facadeSign);
            signs.push({ x: ox + 3, y: oy + 5, text: WORSHIP_SIGNS[religion] });
            shape(4, 5, SHAPE.entrance);
            deco(1, 6, DECOR.tree);
            deco(6, 2, DECOR.tree);
            deco(6, 6, DECOR.bench);
            addPoi({ x: 3, y: 3 }, { x: 4, y: 6 });
            break;
          }
          // Église : nef à toit à deux pans (faîtage selon y), clocher à l'avant.
          fill(3, 1, 4, 4, TILE.worship, 3);
          for (let y = 1; y <= 4; y++) {
            shape(3, y, SHAPE.roofWest);
            shape(4, y, SHAPE.roofEast);
          }
          at(3, 5, TILE.worship, 5);
          shape(3, 5, SHAPE.belfry);
          at(4, 5, TILE.worship, 1);
          shape(4, 5, SHAPE.entrance);
          deco(1, 6, DECOR.tree);
          deco(6, 2, DECOR.tree);
          deco(6, 6, DECOR.bench);
          addPoi({ x: 3, y: 3 }, { x: 4, y: 6 });
          break;
        }
        case 'school': {
          const level = poiHere ? schoolLevel(poiHere) : 'primaire';
          if (level === 'maternelle') {
            // Maternelle : bâtiment bas en L, grande cour avec marelle et arbres.
            fill(1, 1, 6, 2, TILE.civic, 1);
            fill(1, 3, 1, 5, TILE.civic, 1);
            fill(2, 3, 6, 6, TILE.yard);
            deco(4, 4, DECOR.hopscotch);
            deco(6, 6, DECOR.tree);
            deco(2, 6, DECOR.tree);
            deco(6, 3, DECOR.bench);
          } else if (level === 'primaire') {
            // École en L, cour avec marelle, panier et arbre.
            fill(1, 1, 6, 2, TILE.civic, 2);
            fill(1, 3, 2, 6, TILE.civic, 2);
            fill(3, 3, 6, 6, TILE.yard);
            deco(6, 3, DECOR.hoop);
            deco(4, 5, DECOR.hopscotch);
            deco(6, 6, DECOR.tree);
          } else {
            // Collège / lycée : bâtiments en U sur 3-4 niveaux, cour avec paniers.
            const lv = level === 'lycee' ? 4 : 3;
            fill(1, 1, 6, 2, TILE.civic, lv);
            fill(1, 3, 2, 6, TILE.civic, lv - 1);
            fill(5, 3, 6, 4, TILE.civic, lv - 1);
            fill(3, 3, 4, 6, TILE.yard);
            fill(5, 5, 6, 6, TILE.yard);
            deco(3, 3, DECOR.hoop);
            deco(6, 6, DECOR.hoop);
            deco(4, 6, DECOR.tree);
          }
          shape(4, 2, SHAPE.schoolSign);
          signs.push({ x: ox + 4, y: oy + 2, text: SCHOOL_SIGNS[level] });
          deco(5, 1, DECOR.flag);
          addPoi({ x: 3, y: 1 }, { x: level === 'maternelle' ? 4 : 5, y: level === 'college' || level === 'lycee' ? 5 : 4 });
          break;
        }
        case 'gym': {
          if (poiHere && /stade/i.test(poiHere.name)) {
            // Stade : terrain de foot en herbe avec deux buts, petite tribune.
            fill(1, 1, 6, 6, TILE.grass);
            deco(1, 3, DECOR.goal);
            deco(6, 3, DECOR.goal);
            fill(1, 0, 6, 0, TILE.civic, 1);
            addPoi({ x: 3, y: 3 }, { x: 3, y: 7 });
          } else {
            // Gymnase : grand volume à toit plat, enseigne, terrain extérieur.
            fill(1, 1, 6, 3, TILE.civic, 3);
            shape(3, 3, SHAPE.facadeSign);
            signs.push({ x: ox + 3, y: oy + 3, text: 'GYMNASE' });
            shape(4, 3, SHAPE.entrance);
            fill(1, 5, 6, 6, TILE.yard);
            deco(1, 5, DECOR.hoop);
            deco(6, 6, DECOR.hoop);
            addPoi({ x: 3, y: 2 }, { x: 4, y: 4 });
          }
          break;
        }
        case 'market': {
          // Place du marché : dalles, rangées d'étals, arbres d'alignement.
          fill(1, 1, 6, 6, TILE.pedestrian);
          for (const y of [2, 5]) for (const x of [1, 2, 4, 5, 6]) deco(x, y, DECOR.marketStall);
          deco(3, 3, DECOR.tree);
          deco(4, 4, DECOR.bench);
          addPoi({ x: 3, y: 3 }, { x: 3, y: 4 });
          break;
        }
        case 'plaza': {
          // Place : dalles, statue (ou fontaine) au centre, bancs, arbres aux coins, fleurs.
          fill(1, 1, 6, 6, TILE.pedestrian);
          const statue = poiHere && /jeanne/i.test(poiHere.name);
          deco(3, 3, statue ? DECOR.statue : DECOR.fountain);
          for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]] as const) deco(x, y, DECOR.tree);
          for (const [x, y] of [[3, 1], [1, 4], [6, 3], [4, 6]] as const) deco(x, y, DECOR.bench);
          for (const [x, y] of [[2, 3], [5, 4]] as const) deco(x, y, DECOR.flowers);
          addPoi({ x: 3, y: 3 }, { x: 3, y: 5 });
          break;
        }
        case 'station': {
          // Gare : bâtiment voyageurs face aux voies, parvis avec bancs et arbres.
          fill(1, 1, 6, 3, TILE.station, 2);
          shape(3, 3, SHAPE.stationCenter);
          shape(4, 3, SHAPE.entrance);
          deco(1, 5, DECOR.tree);
          deco(6, 5, DECOR.tree);
          deco(2, 5, DECOR.bench);
          deco(5, 5, DECOR.bench);
          stationX = ox + 3.5;
          addPoi({ x: 3, y: 2 }, { x: 4, y: 5 });
          break;
        }
        case 'police': {
          // Commissariat : bâtiment à bandeau bleu, drapeau, voitures de police garées.
          fill(1, 1, 6, 3, TILE.police, 3);
          shape(3, 3, SHAPE.facadeSign);
          deco(5, 1, DECOR.flag);
          for (const x of [1, 2, 5, 6]) {
            deco(x, 5, DECOR.parking);
          }
          deco(1, 5, DECOR.policeCar);
          deco(5, 5, DECOR.policeCar);
          deco(6, 5, DECOR.car);
          addPoi({ x: 3, y: 2 }, { x: 3, y: 4 }, 'Commissariat de police');
          break;
        }
        case 'supermarket': {
          // Grande surface : grand bâtiment bas, entrée vitrée, parking devant.
          fill(1, 1, 6, 3, TILE.supermarket, 2);
          shape(3, 3, SHAPE.facadeSign);
          shape(4, 3, SHAPE.entrance);
          for (let x = 1; x <= 6; x++) {
            for (const y of [5, 6]) {
              deco(x, y, DECOR.parking);
              if (r(60 + x * 3 + y) < 0.45) deco(x, y, DECOR.car);
            }
          }
          // Nommé d'après la vraie rue du magasin, sinon la rue de l'îlot la plus proche.
          const near = poiHere ?? { x: ox + 3, y: oy + 3 };
          const street = poiHere?.street ?? [
            { e: hEdges[j]?.[i], x: i * PITCH + 5, y: j * PITCH },
            { e: hEdges[j + 1]?.[i], x: i * PITCH + 5, y: (j + 1) * PITCH },
            { e: vEdges[i]?.[j], x: i * PITCH, y: j * PITCH + 5 },
            { e: vEdges[i + 1]?.[j], x: (i + 1) * PITCH, y: j * PITCH + 5 },
          ]
            .filter((c) => edgeName(c.e))
            .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y))
            .map((c) => edgeName(c.e))[0];
          addPoi({ x: 3, y: 2 }, { x: 3, y: 4 }, street ? `Supermarché ${street.replace(/^(Rue|Avenue|Boulevard|Allée) (de la |du |des |de l'|de )?/, '')}` : undefined);
          break;
        }
      }
    }
  }

  // ---------- 3b. Quartiers (« Cité du Londeau ») : simple étiquette, on arrive sur le trottoir le plus proche ----------

  for (const q of raw.pois.filter((p) => p.kind === 'quarter')) {
    const cx = Math.round(q.x);
    const cy = Math.round(q.y);
    let entrance: TilePoint | null = null;
    for (let r = 0; r <= PITCH && !entrance; r++) {
      for (let y = cy - r; y <= cy + r && !entrance; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x >= 0 && y >= 0 && x < width && y < height && tileAt(x, y) === TILE.pedestrian) {
            entrance = { x, y };
            break;
          }
        }
      }
    }
    if (entrance) pois.push({ kind: 'quarter', name: q.name, x: cx, y: cy, entrance });
  }

  // ---------- 4. Commerces de rez-de-chaussée : boulangeries, pharmacies, fast-foods, police municipale ----------

  const storefronts: Storefront[] = [];
  const blockStorefronts = new Map<string, number>();
  const center = pois.find((p) => p.kind === 'townhall') ?? { x: width / 2, y: height / 2 };
  const byDistance = (list: RawPoi[]) =>
    [...list].sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  // Commerces sans équivalent dans OSM (ou tenus par des bots, un par ville) : près de la mairie.
  const nearTownhall = (kind: RawPoi['kind']): RawPoi[] => {
    const real = byDistance(raw.pois.filter((p) => p.kind === kind));
    if (real.length > 0) return real.slice(0, 1);
    return [{ kind, name: '', x: center.x + PITCH, y: center.y }];
  };
  const wanted: { poi: RawPoi; kind: Storefront['kind']; sign: string; poiKind: MapPoi['kind']; name?: string }[] = [
    ...nearTownhall('realestate').map((poi) => ({ poi, kind: 'realestate' as const, sign: 'IMMOBILIER', poiKind: 'realestate' as const, name: 'Agence immobilière' })),
    ...nearTownhall('jobcenter').map((poi) => ({ poi, kind: 'jobcenter' as const, sign: 'EMPLOI', poiKind: 'jobcenter' as const, name: "Agence pour l'emploi" })),
    ...nearTownhall('cycles').map((poi) => ({ poi, kind: 'cycles' as const, sign: 'CYCLES', poiKind: 'cycles' as const, name: 'Magasin de cycles' })),
    ...nearTownhall('petshop').map((poi) => ({ poi, kind: 'petshop' as const, sign: 'ANIMALERIE', poiKind: 'petshop' as const, name: 'Animalerie' })),
    ...raw.pois
      .filter((p) => p.kind === 'bakery')
      .slice(0, MAX_BAKERIES)
      .map((poi) => ({ poi, kind: 'bakery' as const, sign: 'BOULANGERIE', poiKind: 'bakery' as const })),
    // Pharmacies : commerce rare, limité par ville ; on garde les plus centrales.
    ...byDistance(raw.pois.filter((p) => p.kind === 'pharmacy'))
      .slice(0, CITY_LIMITS.pharmacies)
      .map((poi) => ({ poi, kind: 'pharmacy' as const, sign: 'PHARMACIE', poiKind: 'pharmacy' as const })),
    ...raw.pois
      .filter((p) => p.kind === 'fastfood')
      .slice(0, MAX_FAST_FOODS)
      .map((poi) => ({ poi, kind: 'fastfood' as const, sign: fastFoodSign(poi), poiKind: 'fastfood' as const })),
    ...raw.pois
      .filter((p) => p.kind === 'police' && !isCommissariat(p))
      .map((poi) => ({ poi, kind: 'police' as const, sign: 'POLICE', poiKind: 'police' as const })),
  ];
  const canHost = (x: number, y: number) => {
    const t = tileAt(x, y);
    return (t === TILE.apartments || t === TILE.commercial) && shapes[y * width + x] === SHAPE.plain;
  };
  for (const { poi, kind, sign, poiKind, name } of wanted) {
    const ci = Math.floor(poi.x / PITCH);
    const cj = Math.floor(poi.y / PITCH);
    // Îlot du commerce réel, puis les îlots voisins (jusqu'à 2 de distance), du plus proche au plus loin.
    const spots: [number, number][] = [];
    for (let dj = -STOREFRONT_SEARCH_BLOCKS; dj <= STOREFRONT_SEARCH_BLOCKS; dj++) {
      for (let di = -STOREFRONT_SEARCH_BLOCKS; di <= STOREFRONT_SEARCH_BLOCKS; di++) spots.push([ci + di, cj + dj]);
    }
    spots.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));
    for (const [i, j] of spots) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      if ((blockStorefronts.get(`${i},${j}`) ?? 0) >= MAX_STOREFRONTS_PER_BLOCK) continue;
      const ox = i * PITCH + 2;
      const oy = j * PITCH + 2;
      // Façades sud et est de l'îlot (visibles), le long d'un trottoir.
      const candidates: [number, number][] = [[2, 6], [5, 6], [6, 2], [6, 5], [1, 6], [6, 1]];
      const spot = candidates.find(([x, y]) => canHost(ox + x, oy + y));
      if (!spot) continue;
      const [x, y] = spot;
      const tilesOf: [number, number][] = [[ox + x, oy + y]];
      // Devanture sur deux cases quand c'est possible.
      const second: [number, number] = y === 6 ? [ox + x + 1, oy + y] : [ox + x, oy + y + 1];
      if (canHost(...second) && second[0] - ox <= 6 && second[1] - oy <= 6) tilesOf.push(second);
      for (const [tx, ty] of tilesOf) {
        setShape(tx, ty, SHAPE.storefront);
        storefronts.push({ x: tx, y: ty, kind, sign });
      }
      blockStorefronts.set(`${i},${j}`, (blockStorefronts.get(`${i},${j}`) ?? 0) + 1);
      const entrance = y === 6 ? { x: ox + x, y: oy + 7 } : { x: ox + 7, y: oy + y };
      pois.push({ kind: poiKind, name: name ?? displayName(poi), x: ox + x, y: oy + y, entrance });
      break;
    }
  }

  // ---------- 4b. Rues commerçantes : une boutique après l'autre, terrasses, foule ----------

  const busy = new Map<string, Map<string, TilePoint>>();
  {
    let mix = 0;
    const eaten = new Set<string>();
    for (const [key, sides] of mainSides) {
      const [i, j] = key.split(',').map(Number) as [number, number];
      const ox = i * PITCH + 2;
      const oy = j * PITCH + 2;
      for (const { side, street } of sides) {
        // Façade le long de la rue (cases de bâtiment) et trottoir devant chacune.
        const along = [1, 2, 3, 4, 5, 6];
        const facade = along.map((k) =>
          side === 's' ? { x: k, y: 6 } : side === 'n' ? { x: k, y: 1 } : side === 'e' ? { x: 6, y: k } : { x: 1, y: k },
        );
        const walk = (p: TilePoint): TilePoint =>
          side === 's' ? { x: p.x, y: 7 } : side === 'n' ? { x: p.x, y: 0 } : side === 'e' ? { x: 7, y: p.y } : { x: 0, y: p.y };
        const sidewalks = busy.get(street) ?? new Map<string, TilePoint>();
        busy.set(street, sidewalks);
        for (let k = 0; k < BLOCK; k++) {
          const p = side === 's' ? { x: k, y: 7 } : side === 'n' ? { x: k, y: 0 } : side === 'e' ? { x: 7, y: k } : { x: 0, y: k };
          const t = { x: ox + p.x, y: oy + p.y };
          if (tileAt(t.x, t.y) === TILE.pedestrian) sidewalks.set(`${t.x},${t.y}`, t);
        }
        // Un local reste libre côté sud et côté est (agence immobilière).
        const free = (p: TilePoint) =>
          canHost(ox + p.x, oy + p.y) && !(side === 's' && p.x === 5) && !(side === 'e' && p.y === 5);
        for (let k = 0; k < facade.length; k++) {
          if (!free(facade[k]!)) continue;
          const shop = SHOP_MIX[mix++ % SHOP_MIX.length]!;
          const tiles = [facade[k]!];
          if (k + 1 < facade.length && free(facade[k + 1]!)) tiles.push(facade[++k]!);
          for (const p of tiles) {
            setShape(ox + p.x, oy + p.y, SHAPE.storefront);
            storefronts.push({
              x: ox + p.x,
              y: oy + p.y,
              kind: shop.kind,
              sign: shop.sign,
              ...(side === 'n' || side === 'w' ? { face: side } : {}),
            });
          }
          const front = walk(tiles[0]!);
          if (shop.eat && !eaten.has(shop.eat)) {
            eaten.add(shop.eat);
            pois.push({ kind: 'fastfood', name: shop.eat, x: ox + tiles[0]!.x, y: oy + tiles[0]!.y, entrance: { x: ox + front.x, y: oy + front.y } });
          }
          // Terrasse devant les cafés et restaurants.
          if ((shop.kind === 'cafe' || shop.kind === 'restaurant') && tiles.length === 2) {
            const t = walk(tiles[1]!);
            if (decor[(oy + t.y) * width + ox + t.x] === DECOR.none) setDecor(ox + t.x, oy + t.y, DECOR.terrace);
          }
        }
      }
    }
  }
  const busyStreets = [...busy].map(([name, tiles]) => ({ name, sidewalks: [...tiles.values()] }));

  // ---------- 5. Tram : tracé ordonné, arrêts et abris ----------

  let tram: Transit['tram'] = null;
  {
    const key = (i: number, j: number) => `${i},${j}`;
    const adj = new Map<string, [number, number][]>();
    const link = (a: [number, number], b: [number, number]) => {
      adj.set(key(...a), [...(adj.get(key(...a)) ?? []), b]);
      adj.set(key(...b), [...(adj.get(key(...b)) ?? []), a]);
    };
    hEdges.forEach((row, j) => row.forEach((e, i) => e.tram && link([i, j], [i + 1, j])));
    vEdges.forEach((col, i) => col.forEach((e, j) => e.tram && link([i, j], [i, j + 1])));
    // Plus long chemin simple (le réseau de tram est petit).
    let best: [number, number][] = [];
    const dfs = (node: [number, number], path: [number, number][], seen: Set<string>) => {
      if (path.length > best.length) best = [...path];
      for (const next of adj.get(key(...node)) ?? []) {
        if (seen.has(key(...next))) continue;
        seen.add(key(...next));
        path.push(next);
        dfs(next, path, seen);
        path.pop();
        seen.delete(key(...next));
      }
    };
    for (const k of adj.keys()) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      dfs([i, j], [[i, j]], new Set([k]));
    }
    if (best.length >= 2) {
      const path = best.map(([i, j]) => ({ x: i * PITCH + 0.5, y: j * PITCH + 0.5 }));
      // Le terminus « gare » en premier, s'il existe.
      if (stationX !== null && Math.abs(path.at(-1)!.x - stationX) < Math.abs(path[0]!.x - stationX)) path.reverse();
      const cumulative = [0];
      for (let k = 1; k < path.length; k++) {
        cumulative.push(cumulative[k - 1]! + Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y));
      }
      const stops: { name: string; at: number }[] = [];
      for (const p of raw.pois.filter((q) => q.kind === 'tram')) {
        // Point du tracé le plus proche de l'arrêt réel.
        let bestStop: { at: number; dist: number; x: number; y: number } | null = null;
        for (let k = 0; k + 1 < path.length; k++) {
          const a = path[k]!;
          const b = path[k + 1]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const dist = Math.hypot(p.x - x, p.y - y);
          if (!bestStop || dist < bestStop.dist) bestStop = { at: cumulative[k]! + t * len, dist, x, y };
        }
        if (!bestStop || bestStop.dist > PITCH * 1.5 || stops.some((s) => s.name === p.name)) continue;
        // Arrêts aux nœuds ou en milieu de tronçon : on arrondit à la case de chaussée.
        const stopTile = { x: Math.round(bestStop.x - 0.5), y: Math.round(bestStop.y - 0.5) };
        stops.push({ name: p.name, at: bestStop.at });
        pois.push({ kind: 'tram', name: `${p.name} (T1)`, x: stopTile.x, y: stopTile.y, entrance: stopTile });
        // Abri sur le trottoir voisin.
        for (const [dx, dy] of [[2, 0], [0, 2], [-1, 0], [0, -1], [2, 1], [1, 2]] as const) {
          const sx = stopTile.x + dx;
          const sy = stopTile.y + dy;
          if (sx >= 0 && sy >= 0 && sx < width && sy < height && tileAt(sx, sy) === TILE.pedestrian && decor[sy * width + sx] === DECOR.none) {
            setDecor(sx, sy, DECOR.shelter);
            break;
          }
        }
      }
      tram = { name: tramName, path, stops: stops.sort((a, b) => a.at - b.at) };
    }
  }

  // ---------- 5b. Bus : arrêts au bord des rues, lignes tracées sur le réseau de rues ----------

  const busStops: BusStop[] = [];
  const bus: BusLine[] = [];
  {
    // Un tronçon de rue « roulable » (pas une rue piétonne, pas les voies ferrées).
    const drivable = (h: boolean, line: number, seg: number) => {
      const e = h ? hEdges[line]?.[seg] : vEdges[line]?.[seg];
      if (!e?.street || e.code === TILE.pedestrian) return false;
      return h || seg !== railRow || e.railCrossing;
    };
    // Arrêts réels regroupés par nom (un arrêt a souvent un quai de chaque côté).
    const byStopName = new Map<string, { x: number; y: number; n: number }>();
    for (const st of raw.busStops) {
      const acc = byStopName.get(st.name) ?? { x: 0, y: 0, n: 0 };
      byStopName.set(st.name, { x: acc.x + st.x, y: acc.y + st.y, n: acc.n + 1 });
    }
    type Snapped = { name: string; h: boolean; line: number; seg: number; along: number; pole: TilePoint; curb: TilePoint };
    const snapped = new Map<string, Snapped>();
    for (const [name, acc] of byStopName) {
      const px = acc.x / acc.n;
      const py = acc.y / acc.n;
      let best: (Snapped & { d: number }) | null = null;
      for (const h of [true, false]) {
        const lines = h ? ny + 1 : nx + 1;
        const segs = h ? nx : ny;
        for (let line = 0; line < lines; line++) {
          for (let seg = 0; seg < segs; seg++) {
            if (!drivable(h, line, seg)) continue;
            const across = line * PITCH + 0.5;
            const along = Math.max(seg * PITCH + 3, Math.min((seg + 1) * PITCH - 2, Math.round(h ? px : py)));
            const d = Math.hypot((h ? along : across) - px, (h ? across : along) - py);
            if (d > BUS_STOP_SNAP || (best && d >= best.d)) continue;
            // Poteau sur le trottoir du côté de l'arrêt réel, sinon de l'autre côté.
            const sideFirst = (h ? py : px) < across ? -1 : 2;
            for (const side of [sideFirst, sideFirst === -1 ? 2 : -1]) {
              const pole = h ? { x: along, y: line * PITCH + side } : { x: line * PITCH + side, y: along };
              if (tileAt(pole.x, pole.y) !== TILE.pedestrian) continue;
              if ([...snapped.values()].some((o) => Math.hypot(o.pole.x - pole.x, o.pole.y - pole.y) < 2)) continue;
              const decorHere = decor[pole.y * width + pole.x];
              if (decorHere !== DECOR.none && decorHere !== DECOR.tree && decorHere !== DECOR.lamp) continue;
              const lane = side === -1 ? 0 : 1;
              const curb = h ? { x: along, y: line * PITCH + lane } : { x: line * PITCH + lane, y: along };
              best = { name, h, line, seg, along, pole, curb, d };
              break;
            }
          }
        }
      }
      if (!best) continue;
      snapped.set(name, best);
    }

    // Graphe des carrefours (nœuds i,j) reliés par les tronçons roulables.
    const nodeKey = (i: number, j: number) => `${i},${j}`;
    const neighbours = (i: number, j: number): [number, number][] => {
      const out: [number, number][] = [];
      if (drivable(true, j, i - 1)) out.push([i - 1, j]);
      if (drivable(true, j, i)) out.push([i + 1, j]);
      if (drivable(false, i, j - 1)) out.push([i, j - 1]);
      if (drivable(false, i, j)) out.push([i, j + 1]);
      return out;
    };
    const shortest = (from: [number, number], to: [number, number]): [number, number][] | null => {
      const prev = new Map<string, [number, number] | null>([[nodeKey(...from), null]]);
      const queue: [number, number][] = [from];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur[0] === to[0] && cur[1] === to[1]) {
          const path: [number, number][] = [];
          for (let c: [number, number] | null = cur; c; c = prev.get(nodeKey(...c)) ?? null) path.unshift(c);
          return path;
        }
        for (const n of neighbours(...cur)) {
          if (prev.has(nodeKey(...n))) continue;
          prev.set(nodeKey(...n), cur);
          queue.push(n);
        }
      }
      return null;
    };
    const ends = (st: Snapped): [[number, number], [number, number]] =>
      st.h
        ? [[st.seg, st.line], [st.seg + 1, st.line]]
        : [[st.line, st.seg], [st.line, st.seg + 1]];

    const servedLines = new Map<string, string[]>();
    for (const route of raw.busRoutes) {
      const stops = route.stopNames.map((n) => snapped.get(n)).filter((st): st is Snapped => !!st);
      const uniq = stops.filter((st, k) => stops.findIndex((o) => o.name === st.name) === k);
      if (uniq.length < 2) continue;
      // Sens de passage de chaque arrêt (entrée/sortie du tronçon), en anticipant l'arrêt suivant.
      // Un arrêt injoignable par les rues du plan est simplement sauté.
      const nodes: [number, number][] = [];
      const served: Snapped[] = [];
      const hops = (from: [number, number], to: [number, number]) => shortest(from, to)?.length ?? Infinity;
      uniq.forEach((st, k) => {
        const [a, b] = ends(st);
        const next = uniq[k + 1];
        // Sens de traversée de l'arrêt : le plus court en venant d'où l'on est et en
        // repartant vers l'arrêt suivant (évite les demi-tours).
        const cost = (entry: [number, number], exit: [number, number]) =>
          (nodes.length > 0 ? hops(nodes.at(-1)!, entry) : 0) + (next ? Math.min(...ends(next).map((e) => hops(exit, e))) : 0);
        const [entry, exit] = cost(a, b) <= cost(b, a) ? [a, b] : [b, a];
        if (nodes.length > 0) {
          const leg = shortest(nodes.at(-1)!, entry);
          // Arrêt injoignable par les rues du plan : on le saute.
          if (!leg) return;
          nodes.push(...leg.slice(1));
        } else {
          nodes.push(entry);
        }
        nodes.push(exit);
        served.push(st);
      });
      if (served.length < 2) continue;
      const path = nodes.map(([i, j]) => ({ x: i * PITCH + 0.5, y: j * PITCH + 0.5 }));
      const cumulative = [0];
      for (let k = 1; k < path.length; k++) cumulative.push(cumulative[k - 1]! + Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y));
      const lineStops: BusLine['stops'] = [];
      for (const st of served) {
        const [a, b] = ends(st);
        // Le tronçon de l'arrêt dans le tracé (dans un sens ou dans l'autre).
        for (let k = 0; k + 1 < nodes.length; k++) {
          const n0 = nodes[k]!;
          const n1 = nodes[k + 1]!;
          const same = (p: [number, number], q: [number, number]) => p[0] === q[0] && p[1] === q[1];
          if (!((same(n0, a) && same(n1, b)) || (same(n0, b) && same(n1, a)))) continue;
          const start = path[k]!;
          const offset = st.h ? Math.abs(st.along - start.x) : Math.abs(st.along - start.y);
          lineStops.push({ name: st.name, at: cumulative[k]! + offset });
          servedLines.set(st.name, [...(servedLines.get(st.name) ?? []), route.ref]);
          break;
        }
      }
      bus.push({ ref: route.ref, path, stops: lineStops });
    }
    for (const st of snapped.values()) {
      const lines = servedLines.get(st.name);
      if (!lines) continue;
      setDecor(st.pole.x, st.pole.y, DECOR.busStop);
      busStops.push({ name: st.name, x: st.pole.x, y: st.pole.y, curb: st.curb, lines: [...new Set(lines)].sort((a, b) => Number(a) - Number(b)) });
    }
  }

  // ---------- 5c. Pistes cyclables : tronçons de rue longés par une piste OSM ----------

  const cycleways: Cycleway[] = [];
  hEdges.forEach((row, j) =>
    row.forEach((e, i) => {
      if (e.street && e.code !== TILE.pedestrian && !e.tram && e.bikeVotes >= PITCH * BIKE_COVERAGE) {
        cycleways.push({ x: i * PITCH + 2, y: j * PITCH, axis: 'x', length: PITCH - 2 });
      }
    }),
  );
  vEdges.forEach((col, i) =>
    col.forEach((e, j) => {
      if (j !== railRow && e.street && e.code !== TILE.pedestrian && !e.tram && e.bikeVotes >= PITCH * BIKE_COVERAGE) {
        cycleways.push({ x: i * PITCH, y: j * PITCH + 2, axis: 'y', length: PITCH - 2 });
      }
    }),
  );

  // ---------- 5d. Marchands ambulants (maïs, marrons) près de la gare, du tram et de la mairie ----------

  const vendors: StreetVendor[] = [];
  for (const { kind, near, count } of VENDORS) {
    const poi = pois.find((p) => p.kind === near);
    if (!poi) continue;
    const c = poi.entrance;
    const spots: { p: TilePoint; d: number }[] = [];
    for (let y = c.y - VENDOR_SEARCH_RADIUS; y <= c.y + VENDOR_SEARCH_RADIUS; y++) {
      for (let x = c.x - VENDOR_SEARCH_RADIUS; x <= c.x + VENDOR_SEARCH_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (tileAt(x, y) !== TILE.pedestrian || decor[y * width + x] !== DECOR.none) continue;
        const d = Math.hypot(x - c.x, y - c.y);
        // Pas devant la porte, et pas collés les uns aux autres.
        if (d < 2 || vendors.some((v) => Math.hypot(v.x - x, v.y - y) < 3)) continue;
        if (spots.some((o) => Math.hypot(o.p.x - x, o.p.y - y) < 3)) continue;
        spots.push({ p: { x, y }, d });
      }
    }
    spots.sort((a, b) => a.d - b.d);
    for (const { p } of spots.slice(0, count)) {
      vendors.push({ id: `${kind}-${vendors.length + 1}`, kind, x: p.x, y: p.y, facing: { ...c } });
    }
  }

  const rail: Transit['rail'] =
    railRow === null
      ? null
      : {
          name: 'RER E',
          tracks: [0, 1, 3, 4, 6, 7].map((dy) => railRow! * PITCH + 2 + dy),
          stationX,
        };

  // ---------- 6. Immeubles de départ : îlots d'immeubles les plus proches de la mairie ----------

  const townhall = pois.find((p) => p.kind === 'townhall') ?? { x: width / 2, y: height / 2 };
  const blockCenter = (b: { i: number; j: number }) => ({ x: b.i * PITCH + 6, y: b.j * PITCH + 6 });
  const starterBlocks = starterCandidates
    .sort((a, b) => {
      const ca = blockCenter(a);
      const cb = blockCenter(b);
      return Math.hypot(ca.x - townhall.x, ca.y - townhall.y) - Math.hypot(cb.x - townhall.x, cb.y - townhall.y);
    })
    .slice(0, STARTER_BLOCKS);
  if (starterBlocks.length === 0) throw new Error(`Aucun îlot d'immeubles pour ${d.districtId}`);

  const starterBuildings: StarterBuilding[] = [];
  for (const b of starterBlocks) {
    const ox = b.i * PITCH + 2;
    const oy = b.j * PITCH + 2;
    let lv = 0;
    for (let y = oy + 1; y <= oy + 6; y++) {
      for (let x = ox + 1; x <= ox + 6; x++) {
        if (tileAt(x, y) === TILE.apartments) {
          tiles[y * width + x] = TILE.starter;
          lv = levels[y * width + x]!;
        }
      }
    }
    // À défaut de rue devant la porte, on prend une rue qui borde l'îlot.
    const anyStreet =
      [hEdges[b.j]?.[b.i], vEdges[b.i]?.[b.j], hEdges[b.j + 1]?.[b.i], vEdges[b.i + 1]?.[b.j]].map(edgeName).find((n) => n) ??
      nearestNamed(raw.roads, { x: ox + 3, y: oy + 3 }) ??
      null;
    // Entrées côté sud et côté est (devant les halls) : face à la caméra.
    const sides = [
      { id: 's', door: { x: ox + 2, y: oy + BLOCK - 1 }, street: edgeName(hEdges[b.j + 1]?.[b.i]) ?? anyStreet },
      { id: 'e', door: { x: ox + BLOCK - 1, y: oy + 2 }, street: edgeName(vEdges[b.i + 1]?.[b.j]) ?? anyStreet },
    ];
    for (const s of sides) {
      setDecor(s.door.x, s.door.y, DECOR.none);
      starterBuildings.push({
        id: `blk-${b.i}-${b.j}-${s.id}`,
        name: `Résidence ${starterBuildings.length + 1}, ${s.street ?? d.districtName}`,
        levels: lv,
        door: s.door,
      });
    }
  }

  // ---------- 6b. Biens de l'agence immobilière : appartements, maisons, locaux vides ----------

  const properties: PropertySpot[] = [];
  {
    const starterSet = new Set(starterBlocks.map((b) => `${b.i},${b.j}`));
    const farthest = Math.hypot(width, height) / 2;
    const centrality = (p: TilePoint) => Math.round(Math.max(0, 1 - Math.hypot(p.x - townhall.x, p.y - townhall.y) / farthest) * 100) / 100;
    const walkable = (p: TilePoint) => WALKABLE_TILES.has(tileAt(p.x, p.y) ?? '');
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const kind = kinds[j]![i]!;
        const ox = i * PITCH + 2;
        const oy = j * PITCH + 2;
        const any =
          [hEdges[j + 1]?.[i], vEdges[i + 1]?.[j], hEdges[j]?.[i], vEdges[i]?.[j]].map(edgeName).find((n) => n) ?? d.districtName;
        const south = edgeName(hEdges[j + 1]?.[i]) ?? any;
        const east = edgeName(vEdges[i + 1]?.[j]) ?? any;
        if ((kind === 'apartments' || kind === 'tower' || kind === 'mainstreet') && !starterSet.has(`${i},${j}`)) {
          // Deux appartements (T2 et T4) par hall d'entrée, côté sud et côté est.
          for (const side of [
            { id: 's', facade: { x: ox + 2, y: oy + 6 }, door: { x: ox + 2, y: oy + BLOCK - 1 }, street: south },
            { id: 'e', facade: { x: ox + 6, y: oy + 2 }, door: { x: ox + BLOCK - 1, y: oy + 2 }, street: east },
          ]) {
            if (!BUILDING_CODES.has(tileAt(side.facade.x, side.facade.y) ?? '') || !walkable(side.door)) continue;
            for (const rooms of [2, 4]) {
              properties.push({
                id: `apt-${i}-${j}-${side.id}-${rooms}`,
                kind: 'apartment',
                name: `Appartement T${rooms}, ${side.street}`,
                door: side.door,
                facade: side.facade,
                rooms,
                centrality: centrality(side.door),
              });
            }
          }
          // Rez-de-chaussée commerçant le long des grands axes.
          for (const [lx, ly, side, edge] of [[5, 6, 's', hEdges[j + 1]?.[i]], [6, 5, 'e', vEdges[i + 1]?.[j]]] as const) {
            if (!edge?.street || (edge.code !== TILE.majorRoad && kind !== 'mainstreet')) continue;
            const facade = { x: ox + lx, y: oy + ly };
            if (!BUILDING_CODES.has(tileAt(facade.x, facade.y) ?? '') || shapes[facade.y * width + facade.x] !== SHAPE.plain) continue;
            const door = side === 's' ? { x: facade.x, y: facade.y + 1 } : { x: facade.x + 1, y: facade.y };
            if (!walkable(door)) continue;
            properties.push({
              id: `local-${facade.x}-${facade.y}`,
              kind: 'local',
              name: `Local commercial, ${side === 's' ? south : east}`,
              door,
              facade,
              rooms: 1,
              centrality: centrality(door),
            });
          }
        } else if (kind === 'houses' || kind === 'gardens') {
          for (let y = oy; y < oy + BLOCK; y++) {
            for (let x = ox; x < ox + BLOCK; x++) {
              if (shapes[y * width + x] !== SHAPE.roofSouthDoor) continue;
              const door = { x, y: y + 1 };
              if (!walkable(door)) continue;
              properties.push({
                id: `house-${x}-${y}`,
                kind: 'house',
                name: `Maison, ${south}`,
                door,
                facade: { x, y },
                rooms: 3 + (levels[y * width + x] ?? 1),
                centrality: centrality(door),
              });
            }
          }
        } else if (kind === 'shops') {
          // Locaux vides : façades de boutique sans commerce (sud, puis est).
          for (const [lx, ly, side] of [[2, 6, 's'], [5, 6, 's'], [6, 2, 'e']] as const) {
            const facade = { x: ox + lx, y: oy + ly };
            if (tileAt(facade.x, facade.y) !== TILE.commercial || shapes[facade.y * width + facade.x] !== SHAPE.plain) continue;
            const door = side === 's' ? { x: facade.x, y: facade.y + 1 } : { x: facade.x + 1, y: facade.y };
            if (!walkable(door)) continue;
            properties.push({
              id: `local-${facade.x}-${facade.y}`,
              kind: 'local',
              name: `Local commercial, ${side === 's' ? south : east}`,
              door,
              facade,
              rooms: 1,
              centrality: centrality(door),
            });
          }
        }
      }
    }
  }

  // ---------- 7. Noms de rues (réparties le long de chaque rue) ----------

  const byName = new Map<string, { x: number; y: number; axis: 'x' | 'y' }[]>();
  hEdges.forEach((row, j) =>
    row.forEach((e, i) => {
      const n = edgeName(e);
      if (n) byName.set(n, [...(byName.get(n) ?? []), { x: i * PITCH + 5.5, y: j * PITCH + 0.5, axis: 'x' }]);
    }),
  );
  vEdges.forEach((col, i) =>
    col.forEach((e, j) => {
      const n = edgeName(e);
      if (n && j !== railRow) byName.set(n, [...(byName.get(n) ?? []), { x: i * PITCH + 0.5, y: j * PITCH + 5.5, axis: 'y' }]);
    }),
  );
  const streets: StreetLabel[] = [];
  for (const [name, spots] of byName) {
    const count = Math.ceil(spots.length / 4);
    for (let k = 0; k < count; k++) streets.push({ name, ...spots[Math.floor(((k + 0.5) * spots.length) / count)]! });
  }

  const spawn = pois.find((p) => p.kind === 'townhall')?.entrance ?? starterBuildings[0]!.door;
  const rows = (arr: string[]) => Array.from({ length: height }, (_, y) => arr.slice(y * width, (y + 1) * width).join(''));

  return {
    cityId: d.cityId,
    cityName: d.cityName,
    districtId: d.districtId,
    districtName: d.districtName,
    width,
    height,
    cellSizeMeters: 8,
    tiles: rows(tiles),
    levels: Array.from({ length: height }, (_, y) => Array.from(levels.subarray(y * width, (y + 1) * width)).join('')),
    decor: rows(decor),
    shapes: rows(shapes),
    storefronts,
    busyStreets,
    transit: { tram, rail, bus, busStops },
    cycleways,
    vendors,
    signs,
    properties,
    starterBuildings,
    pois,
    streets,
    spawn,
    attribution: '© les contributeurs d’OpenStreetMap (ODbL)',
    source: { bbox: d.bbox, fetchedAt: new Date().toISOString().slice(0, 10) },
  };
}
