/**
 * Transforme la carte OSM brute en PLAN SCHÉMATISÉ jouable :
 * - une grille régulière de rues droites (pas `PITCH` cases) ; un tronçon devient
 *   une vraie rue (avec son nom réel) si une rue OSM passe à cet endroit, sinon
 *   une allée piétonne ;
 * - des îlots propres dont le type (pavillons, immeubles, cité, commerces,
 *   square, mairie…) reprend le caractère réel du quartier à cet endroit ;
 * - les lieux connus gardent leur nom et leur position approximative.
 */
import {
  DECOR,
  TILE,
  type DistrictMap,
  type MapPoi,
  type StarterBuilding,
  type StreetLabel,
  type TilePoint,
} from '@jeu-ville/shared';
import type { DistrictSource } from './districts.js';
import type { Pt } from './raster.js';

/** Pas de la grille : 2 cases de rue + un îlot de 8 cases (trottoirs compris). */
const PITCH = 10;
const BLOCK = PITCH - 2;
/** Part minimale d'un tronçon couverte par une rue OSM pour devenir une rue. */
const STREET_COVERAGE = 0.5;
/** Distance max (en cases) entre une rue OSM et la ligne de grille qui la représente. */
const SNAP_DISTANCE = PITCH * 0.4;
const STARTER_BLOCKS = 3;
const MAX_SCHOOLS = 3;

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
  pois: RawPoi[];
}

type BlockKind = 'houses' | 'gardens' | 'apartments' | 'tower' | 'shops' | 'park' | 'townhall' | 'worship' | 'school';

interface Edge {
  votes: number;
  names: Map<string, number>;
  code: string;
  street: boolean;
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
  const set = (x: number, y: number, code: string, lv = 0) => {
    tiles[y * width + x] = code;
    levels[y * width + x] = lv;
  };
  const setDecor = (x: number, y: number, c: string) => {
    decor[y * width + x] = c;
  };

  // ---------- 1. Rues : vote des rues OSM sur les tronçons de la grille ----------

  const newEdge = (): Edge => ({ votes: 0, names: new Map(), code: TILE.road, street: false });
  /** hEdges[j][i] : ligne horizontale j, entre les nœuds i et i+1. */
  const hEdges = Array.from({ length: ny + 1 }, () => Array.from({ length: nx }, newEdge));
  const vEdges = Array.from({ length: nx + 1 }, () => Array.from({ length: ny }, newEdge));
  const rank = (code: string) => (code === TILE.majorRoad ? 2 : code === TILE.road ? 1 : 0);

  for (const road of raw.roads) {
    const code = STREET_CLASSES[road.highway];
    if (!code) continue;
    for (let k = 0; k + 1 < road.pts.length; k++) {
      const a = road.pts[k]!;
      const b = road.pts[k + 1]!;
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
        if (!edge) continue;
        edge.votes += len / steps;
        if (road.name) edge.names.set(road.name, (edge.names.get(road.name) ?? 0) + len / steps);
        if (rank(code) > rank(edge.code) || edge.votes === len / steps) edge.code = code;
      }
    }
  }
  const allEdges = [...hEdges.flat(), ...vEdges.flat()];
  for (const e of allEdges) e.street = e.votes >= PITCH * STREET_COVERAGE;

  // Supprime les bouts de rue isolés (aucune rue voisine à leurs deux extrémités).
  const streetAt = (h: boolean, line: number, seg: number) =>
    (h ? hEdges[line]?.[seg] : vEdges[line]?.[seg])?.street ?? false;
  const nodeDegree = (i: number, j: number) =>
    Number(streetAt(true, j, i - 1)) + Number(streetAt(true, j, i)) + Number(streetAt(false, i, j - 1)) + Number(streetAt(false, i, j));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const e = hEdges[j]![i]!;
      if (e.street && nodeDegree(i, j) === 1 && nodeDegree(i + 1, j) === 1) e.street = false;
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const e = vEdges[i]![j]!;
      if (e.street && nodeDegree(i, j) === 1 && nodeDegree(i, j + 1) === 1) e.street = false;
    }
  }

  const edgeName = (e: Edge | undefined): string | null => {
    if (!e?.street) return null;
    let best: [string, number] | null = null;
    for (const entry of e.names) if (!best || entry[1] > best[1]) best = entry;
    return best?.[0] ?? null;
  };

  // Tracé des rues et allées.
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const e = hEdges[j]![i]!;
      const y0 = j * PITCH;
      for (let x = i * PITCH + 2; x < (i + 1) * PITCH; x++) {
        const end = x === i * PITCH + 2 || x === (i + 1) * PITCH - 1;
        for (const y of [y0, y0 + 1]) {
          // Hors rue : coulée verte (toujours praticable à pied).
          set(x, y, e.street ? e.code : TILE.grass);
          if (e.street && e.code !== TILE.pedestrian) setDecor(x, y, end ? DECOR.crossingX : y === y0 ? DECOR.laneX : DECOR.none);
        }
      }
      if (!e.street) setDecor(i * PITCH + 5, y0 + (hash(i, j, 1) < 0.5 ? 0 : 1), DECOR.tree);
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const e = vEdges[i]![j]!;
      const x0 = i * PITCH;
      for (let y = j * PITCH + 2; y < (j + 1) * PITCH; y++) {
        const end = y === j * PITCH + 2 || y === (j + 1) * PITCH - 1;
        for (const x of [x0, x0 + 1]) {
          set(x, y, e.street ? e.code : TILE.grass);
          if (e.street && e.code !== TILE.pedestrian) setDecor(x, y, end ? DECOR.crossingY : x === x0 ? DECOR.laneY : DECOR.none);
        }
      }
      if (!e.street) setDecor(x0 + (hash(i, j, 2) < 0.5 ? 0 : 1), j * PITCH + 5, DECOR.tree);
    }
  }
  // Carrefours : chaussée si une rue y arrive.
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const incident = [hEdges[j]?.[i - 1], hEdges[j]?.[i], vEdges[i]?.[j - 1], vEdges[i]?.[j]].filter((e) => e?.street && e.code !== TILE.pedestrian);
      const code = incident.length === 0 ? TILE.grass : incident.some((e) => e!.code === TILE.majorRoad) ? TILE.majorRoad : TILE.road;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) set(i * PITCH + dx, j * PITCH + dy, code);
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
          if ('BHACSIKOV'.includes(t)) {
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
      if (c.green / c.total >= 0.3) kind = 'park';
      else if (c.building / c.total < 0.12) kind = 'gardens';
      else if (c.shop >= 0.3 * c.building) kind = 'shops';
      else if (c.apart >= c.house && lv >= 5.5) kind = 'tower';
      else if (c.apart >= c.house) kind = 'apartments';
      else kind = 'houses';
      kinds[j]!.push(kind);
    }
  }

  // Lieux notables : chacun occupe un îlot (le sien, ou un voisin libre).
  const priority: MapPoi['kind'][] = ['townhall', 'worship', 'school', 'park', 'market', 'station'];
  const schoolsFirst = (p: RawPoi) => (/collège|groupe scolaire/i.test(p.name) ? 0 : 1);
  const sortedPois = [...raw.pois].sort(
    (a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || schoolsFirst(a) - schoolsFirst(b),
  );
  const claimed = new Map<string, RawPoi>();
  let schools = 0;
  for (const p of sortedPois) {
    if (p.kind === 'school' && schools >= MAX_SCHOOLS) continue;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor(p.x / PITCH)));
    const cj = Math.min(ny - 1, Math.max(0, Math.floor(p.y / PITCH)));
    const spots: [number, number][] = [[ci, cj]];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) spots.push([ci + dx, cj + dy]);
    const free = spots.find(([i, j]) => i >= 0 && j >= 0 && i < nx && j < ny && !claimed.has(`${i},${j}`));
    if (!free) continue;
    claimed.set(`${free[0]},${free[1]}`, p);
    if (p.kind === 'school') schools++;
    const kind: BlockKind | null =
      p.kind === 'townhall' ? 'townhall' : p.kind === 'worship' ? 'worship' : p.kind === 'school' ? 'school' : p.kind === 'park' ? 'park' : null;
    if (kind) kinds[free[1]]![free[0]] = kind;
  }

  // ---------- 3. Remplissage des îlots ----------

  const pois: MapPoi[] = [];
  const starterCandidates: { i: number; j: number }[] = [];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ox = i * PITCH + 2;
      const oy = j * PITCH + 2;
      const kind = kinds[j]![i]!;
      const r = (salt: number) => hash(i, j, salt);
      const at = (lx: number, ly: number, code: string, lv = 0) => set(ox + lx, oy + ly, code, lv);
      const deco = (lx: number, ly: number, c: string) => setDecor(ox + lx, oy + ly, c);
      const fill = (x0: number, y0: number, x1: number, y1: number, code: string, lv = 0) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) at(x, y, code, lv);
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

      // Trottoir tout autour, avec quelques arbres et un lampadaire.
      fill(0, 0, BLOCK - 1, BLOCK - 1, TILE.pedestrian);
      deco(0, 0, DECOR.lamp);
      deco(BLOCK - 1, BLOCK - 1, DECOR.lamp);
      if (kind !== 'park') {
        deco(0, 4, DECOR.tree);
        deco(BLOCK - 1, 3, DECOR.tree);
      }

      switch (kind) {
        case 'houses':
        case 'gardens': {
          fill(1, 1, 6, 6, TILE.grass);
          // Plusieurs dispositions de pavillons (maisons de 2×2), choisies par îlot.
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
          layout.forEach(([x, y], k) => fill(x, y, x + 1, y + 1, TILE.house, 1 + (r(k) < 0.6 ? 1 : 0)));
          for (const [x, y, c] of [[3, 3, DECOR.tree], [4, 4, DECOR.flowers], [6, 3, DECOR.tree], [2, 6, DECOR.flowers]] as const) {
            if (tiles[(oy + y) * width + ox + x] === TILE.grass) deco(x, y, c);
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
          deco(4, 4, DECOR.tree);
          deco(3, 4, DECOR.bench);
          starterCandidates.push({ i, j });
          break;
        }
        case 'tower': {
          fill(1, 1, 6, 6, TILE.grass);
          fill(1, 1, 6, 2, TILE.apartments, 7 + (r(4) < 0.5 ? 0 : 1));
          fill(5, 4, 6, 6, TILE.apartments, 6);
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
              if (tiles[(oy + y) * width + ox + x] !== TILE.grass) continue;
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
          fill(2, 1, 5, 4, TILE.townhall, 3);
          deco(1, 6, DECOR.flowers);
          deco(6, 6, DECOR.flowers);
          deco(1, 5, DECOR.tree);
          deco(6, 5, DECOR.tree);
          addPoi({ x: 3, y: 2 }, { x: 3, y: 5 });
          break;
        }
        case 'worship': {
          fill(3, 1, 4, 5, TILE.worship, 4);
          deco(1, 6, DECOR.tree);
          deco(6, 2, DECOR.tree);
          addPoi({ x: 3, y: 3 }, { x: 3, y: 6 });
          break;
        }
        case 'school': {
          fill(1, 1, 6, 2, TILE.civic, 2);
          fill(1, 3, 2, 6, TILE.civic, 2);
          deco(5, 5, DECOR.tree);
          addPoi({ x: 3, y: 1 }, { x: 4, y: 4 });
          break;
        }
      }
    }
  }

  // ---------- 4. Immeubles de départ : îlots d'immeubles les plus proches de la mairie ----------

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
        if (tiles[y * width + x] === TILE.apartments) {
          tiles[y * width + x] = TILE.starter;
          lv = levels[y * width + x]!;
        }
      }
    }
    // À défaut de rue devant la porte, on prend une rue qui borde l'îlot.
    const anyStreet =
      [hEdges[b.j]?.[b.i], vEdges[b.i]?.[b.j], hEdges[b.j + 1]?.[b.i], vEdges[b.i + 1]?.[b.j]].map(edgeName).find((n) => n) ??
      null;
    // Entrées côté sud et côté est : face à la caméra, le perso reste visible devant sa porte.
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

  // ---------- 5. Noms de rues (une étiquette par rue, sur son tronçon central) ----------

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
      if (n) byName.set(n, [...(byName.get(n) ?? []), { x: i * PITCH + 0.5, y: j * PITCH + 5.5, axis: 'y' }]);
    }),
  );
  const streets: StreetLabel[] = [];
  for (const [name, spots] of byName) {
    // Une étiquette tous les 4 tronçons environ, réparties le long de la rue.
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
    starterBuildings,
    pois,
    streets,
    spawn,
    attribution: '© les contributeurs d’OpenStreetMap (ODbL)',
    source: { bbox: d.bbox, fetchedAt: new Date().toISOString().slice(0, 10) },
  };
}
