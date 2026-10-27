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
  DECOR,
  SHAPE,
  TILE,
  type DistrictMap,
  type MapPoi,
  type StarterBuilding,
  type StreetLabel,
  type TilePoint,
  type Transit,
} from '@jeu-ville/shared';
import type { DistrictSource } from './districts.js';
import type { Pt } from './raster.js';

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
const MAX_SCHOOLS = 3;
const MAX_BAKERIES = 3;

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
  | 'rail';

interface Edge {
  votes: number;
  tramVotes: number;
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

  // Lieux notables qui occupent un îlot entier (le leur, ou un voisin libre).
  const BLOCK_POIS: Partial<Record<MapPoi['kind'], BlockKind>> = {
    townhall: 'townhall',
    station: 'station',
    worship: 'worship',
    school: 'school',
    park: 'park',
  };
  const priority: MapPoi['kind'][] = ['townhall', 'station', 'worship', 'school', 'park'];
  const schoolsFirst = (p: RawPoi) => (/collège|groupe scolaire/i.test(p.name) ? 0 : 1);
  const sortedPois = raw.pois
    .filter((p) => BLOCK_POIS[p.kind])
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || schoolsFirst(a) - schoolsFirst(b));
  const claimed = new Map<string, RawPoi>();
  let schools = 0;
  for (const p of sortedPois) {
    if (p.kind === 'school' && schools >= MAX_SCHOOLS) continue;
    let ci = Math.min(nx - 1, Math.max(0, Math.floor(p.x / PITCH)));
    let cj = Math.min(ny - 1, Math.max(0, Math.floor(p.y / PITCH)));
    // La gare se place juste au sud du faisceau ferré, face aux voies.
    if (p.kind === 'station' && railRow !== null) cj = Math.min(ny - 1, railRow + 1);
    const spots: [number, number][] = [[ci, cj]];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) spots.push([ci + dx, cj + dy]);
    const free = spots.find(
      ([i, j]) => i >= 0 && j >= 0 && i < nx && j < ny && j !== railRow && !claimed.has(`${i},${j}`),
    );
    if (!free) continue;
    [ci, cj] = free;
    claimed.set(`${ci},${cj}`, p);
    if (p.kind === 'school') schools++;
    kinds[cj]![ci] = BLOCK_POIS[p.kind]!;
  }

  // ---------- 3. Remplissage des îlots ----------

  const pois: MapPoi[] = [];
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
      const addPoi = (center: TilePoint, entrance: TilePoint) => {
        if (!poiHere) return;
        pois.push({
          kind: poiHere.kind,
          name: poiHere.name,
          x: ox + center.x,
          y: oy + center.y,
          entrance: { x: ox + entrance.x, y: oy + entrance.y },
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
          // École en L, enseigne et drapeau ; cour avec marelle, panier et arbre.
          fill(1, 1, 6, 2, TILE.civic, 2);
          fill(1, 3, 2, 6, TILE.civic, 2);
          shape(4, 2, SHAPE.schoolSign);
          deco(5, 1, DECOR.flag);
          fill(3, 3, 6, 6, TILE.yard);
          deco(6, 3, DECOR.hoop);
          deco(4, 5, DECOR.hopscotch);
          deco(6, 6, DECOR.tree);
          addPoi({ x: 3, y: 1 }, { x: 5, y: 4 });
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
      }
    }
  }

  // ---------- 4. Boulangeries : au rez-de-chaussée d'un immeuble ou commerce proche ----------

  const bakeries = raw.pois.filter((p) => p.kind === 'bakery');
  const usedBlocks = new Set<string>();
  for (const p of bakeries) {
    if (pois.filter((q) => q.kind === 'bakery').length >= MAX_BAKERIES) break;
    const ci = Math.floor(p.x / PITCH);
    const cj = Math.floor(p.y / PITCH);
    const spots: [number, number][] = [[ci, cj], [ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]];
    for (const [i, j] of spots) {
      if (i < 0 || j < 0 || i >= nx || j >= ny || usedBlocks.has(`${i},${j}`)) continue;
      const ox = i * PITCH + 2;
      const oy = j * PITCH + 2;
      // Façade sud de l'îlot (visible), à côté d'un trottoir.
      const candidates: [number, number][] = [[2, 6], [1, 6], [5, 6], [6, 6], [6, 1]];
      const spot = candidates.find(([x, y]) => {
        const t = tileAt(ox + x, oy + y);
        return (t === TILE.apartments || t === TILE.commercial) && shapes[(oy + y) * width + ox + x] === SHAPE.plain;
      });
      if (!spot) continue;
      const [x, y] = spot;
      setShape(ox + x, oy + y, SHAPE.bakery);
      // Devanture sur deux cases quand c'est possible.
      const nx2 = y === 6 ? x + 1 : x;
      const ny2 = y === 6 ? y : y + 1;
      const t2 = tileAt(ox + nx2, oy + ny2);
      if ((t2 === TILE.apartments || t2 === TILE.commercial) && shapes[(oy + ny2) * width + ox + nx2] === SHAPE.plain) {
        setShape(ox + nx2, oy + ny2, SHAPE.bakery);
      }
      usedBlocks.add(`${i},${j}`);
      const entrance = y === 6 ? { x: ox + x, y: oy + 7 } : { x: ox + 7, y: oy + y };
      pois.push({ kind: 'bakery', name: p.name, x: ox + x, y: oy + y, entrance });
      break;
    }
  }

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
    .filter((b) => !usedBlocks.has(`${b.i},${b.j}`))
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
    transit: { tram, rail },
    starterBuildings,
    pois,
    streets,
    spawn,
    attribution: '© les contributeurs d’OpenStreetMap (ODbL)',
    source: { bbox: d.bbox, fetchedAt: new Date().toISOString().slice(0, 10) },
  };
}
