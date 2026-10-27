/**
 * Génère les cartes de quartier (JSON) à partir des données OSM brutes.
 * Sortie : packages/shared/maps/<ville>--<quartier>.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, WALKABLE_TILES, type DistrictMap, type MapPoi, type StarterBuilding, type TilePoint } from '@jeu-ville/shared';
import { DISTRICTS, mapFileName, osmFileName, type DistrictSource } from './districts.js';
import { parseOsm, type OsmData, type OsmWay, type Tags } from './osm.js';
import { assembleRings, fillRings, makeProjection, strokeLine, type Pt } from './raster.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '..', '..', 'packages', 'shared', 'maps');

const CELL_SIZE_METERS = 8;
const STARTER_BUILDING_COUNT = 6;
const STARTER_MIN_LEVELS = 4;
const STARTER_MIN_CELLS = 4;

/** Largeur des voies en mètres et code de case associé. */
const HIGHWAYS: Record<string, { meters: number; code: string }> = {
  motorway: { meters: 16, code: TILE.majorRoad },
  trunk: { meters: 14, code: TILE.majorRoad },
  primary: { meters: 13, code: TILE.majorRoad },
  secondary: { meters: 12, code: TILE.majorRoad },
  tertiary: { meters: 10, code: TILE.majorRoad },
  residential: { meters: 8, code: TILE.road },
  unclassified: { meters: 8, code: TILE.road },
  living_street: { meters: 7, code: TILE.road },
  service: { meters: 5, code: TILE.road },
  pedestrian: { meters: 8, code: TILE.pedestrian },
  footway: { meters: 3, code: TILE.pedestrian },
  path: { meters: 3, code: TILE.pedestrian },
  cycleway: { meters: 3, code: TILE.pedestrian },
  steps: { meters: 3, code: TILE.pedestrian },
  track: { meters: 4, code: TILE.pedestrian },
};

const GREEN = {
  leisure: ['park', 'garden', 'playground', 'pitch', 'recreation_ground', 'common'],
  landuse: ['grass', 'recreation_ground', 'cemetery', 'meadow', 'forest', 'village_green', 'allotments'],
  natural: ['wood', 'scrub', 'grassland'],
};

function isGreen(t: Tags): boolean {
  return (
    GREEN.leisure.includes(t.leisure ?? '') ||
    GREEN.landuse.includes(t.landuse ?? '') ||
    GREEN.natural.includes(t.natural ?? '')
  );
}

function isPaved(t: Tags): boolean {
  return (
    t.amenity === 'parking' ||
    t.place === 'square' ||
    t.railway === 'platform' ||
    t.public_transport === 'platform' ||
    (t.highway === 'pedestrian' && t.area === 'yes') ||
    t.area === 'yes' && t.highway === 'footway'
  );
}

function isBuilding(t: Tags): boolean {
  if (!t.building || t.building === 'no' || t.building === 'roof') return false;
  if (t.location === 'underground' || Number(t.layer ?? 0) < 0) return false;
  return true;
}

/** Petite variation déterministe (0, 1 ou 2) pour éviter des blocs tous identiques. */
function jitter(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 3;
}

/**
 * Nombre d'étages. La plupart des bâtiments OSM du 93 n'ont que `building=yes` :
 * on estime alors la hauteur d'après l'emprise au sol (en cases).
 */
function buildingLevels(t: Tags, id: string, cellCount: number): number {
  const levels = Number.parseInt(t['building:levels'] ?? '', 10);
  if (Number.isFinite(levels) && levels > 0) return Math.min(9, levels);
  const h = Number.parseFloat(t.height ?? '');
  if (Number.isFinite(h) && h > 0) return Math.min(9, Math.max(1, Math.round(h / 3)));
  switch (t.building) {
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'terrace':
      return 2;
    case 'apartments':
      return 5;
    case 'garage':
    case 'garages':
    case 'shed':
    case 'kiosk':
      return 1;
    case 'yes':
    case 'residential':
      if (cellCount <= 3) return 1 + (jitter(id) > 0 ? 1 : 0);
      if (cellCount <= 9) return 3 + (jitter(id) === 2 ? 1 : 0);
      if (cellCount <= 29) return 4 + jitter(id);
      return 6 + jitter(id);
    default:
      return 3;
  }
}

function buildingCode(t: Tags, levels: number): string {
  const b = t.building ?? '';
  if (t.amenity === 'townhall' || t.amenity === 'school' || t.amenity === 'place_of_worship') return TILE.civic;
  if (['civic', 'public', 'school', 'townhall', 'church', 'government', 'train_station', 'college', 'kindergarten', 'hospital'].includes(b)) {
    return TILE.civic;
  }
  if (['retail', 'commercial', 'supermarket', 'kiosk', 'office'].includes(b) || t.shop) return TILE.commercial;
  if (['industrial', 'warehouse', 'garage', 'garages', 'shed'].includes(b)) return TILE.industrial;
  if (b === 'apartments') return TILE.apartments;
  if (b === 'residential' || b === 'yes') {
    if (levels >= STARTER_MIN_LEVELS) return TILE.apartments;
    if (levels <= 2) return TILE.house;
  }
  if (['house', 'detached', 'semidetached_house', 'terrace'].includes(b)) return TILE.house;
  return TILE.building;
}

interface BuildingInfo {
  id: string;
  tags: Tags;
  code: string;
  levels: number;
  cells: number[];
}

function buildDistrict(d: DistrictSource, osm: OsmData): DistrictMap {
  const { project, width, height } = makeProjection(d.bbox, CELL_SIZE_METERS);
  const size = width * height;
  const tiles = new Array<string>(size).fill(TILE.ground);
  const levels = new Uint8Array(size);
  const owner = new Int32Array(size).fill(-1);

  const pt = (nodeId: string): Pt | null => {
    const n = osm.nodes.get(nodeId);
    return n ? project(n.lat, n.lon) : null;
  };
  const wayPoints = (w: OsmWay): Pt[] => w.nodes.map(pt).filter((p): p is Pt => p !== null);
  const isClosed = (w: OsmWay) => w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1];

  /** Polygones issus des chemins fermés et des multipolygones. */
  const areas: { id: string; tags: Tags; rings: Pt[][] }[] = [];
  for (const w of osm.ways.values()) {
    if (isClosed(w)) areas.push({ id: `w${w.id}`, tags: w.tags, rings: [wayPoints(w)] });
  }
  for (const r of osm.relations) {
    if (r.tags.type !== 'multipolygon') continue;
    const segments = r.members
      .filter((m) => m.type === 'way')
      .map((m) => osm.ways.get(m.ref)?.nodes)
      .filter((n): n is string[] => !!n);
    const rings = assembleRings(segments).map((ring) => ring.map(pt).filter((p): p is Pt => p !== null));
    if (rings.length > 0) areas.push({ id: `r${r.id}`, tags: r.tags, rings });
  }

  const paint = (code: string) => (x: number, y: number) => {
    tiles[y * width + x] = code;
  };

  // 1. Espaces verts, places/parkings, eau.
  for (const a of areas) if (isGreen(a.tags)) fillRings(a.rings, width, height, paint(TILE.grass));
  for (const a of areas) if (isPaved(a.tags)) fillRings(a.rings, width, height, paint(TILE.pedestrian));
  for (const a of areas) {
    if (a.tags.natural === 'water' || a.tags.waterway === 'riverbank') fillRings(a.rings, width, height, paint(TILE.water));
  }

  // 2. Voies ferrées (hors tunnels), puis rues par-dessus (passages à niveau, ponts).
  for (const w of osm.ways.values()) {
    if ((w.tags.railway === 'rail' || w.tags.railway === 'light_rail') && w.tags.tunnel !== 'yes') {
      strokeLine(wayPoints(w), 6 / CELL_SIZE_METERS, width, height, paint(TILE.rail));
    }
  }
  const roads = [...osm.ways.values()]
    .filter((w) => w.tags.highway && HIGHWAYS[w.tags.highway] && w.tags.tunnel !== 'yes' && w.tags.area !== 'yes')
    // Les grandes routes en dernier pour qu'elles gardent leur code.
    .sort((a, b) => HIGHWAYS[a.tags.highway!]!.meters - HIGHWAYS[b.tags.highway!]!.meters);
  for (const w of roads) {
    const spec = HIGHWAYS[w.tags.highway!]!;
    strokeLine(wayPoints(w), spec.meters / CELL_SIZE_METERS, width, height, paint(spec.code));
  }

  // 3. Bâtiments (ils gardent leur emprise par-dessus les rues élargies).
  const buildings: BuildingInfo[] = [];
  for (const a of areas) {
    if (!isBuilding(a.tags)) continue;
    // Emprise d'abord, pour estimer la hauteur.
    const footprint: number[] = [];
    fillRings(a.rings, width, height, (x, y) => footprint.push(y * width + x));
    if (footprint.length === 0) {
      // Petit bâtiment : au moins sa case centrale.
      const ring = a.rings[0] ?? [];
      const cx = Math.floor(ring.reduce((s, p) => s + p.x, 0) / Math.max(1, ring.length));
      const cy = Math.floor(ring.reduce((s, p) => s + p.y, 0) / Math.max(1, ring.length));
      if (cx >= 0 && cy >= 0 && cx < width && cy < height) footprint.push(cy * width + cx);
    }
    if (footprint.length === 0) continue;
    const lv = buildingLevels(a.tags, a.id, footprint.length);
    const info: BuildingInfo = { id: a.id, tags: a.tags, code: buildingCode(a.tags, lv), levels: lv, cells: footprint };
    for (const i of footprint) {
      tiles[i] = info.code;
      levels[i] = lv;
      owner[i] = buildings.length;
    }
    if (info.cells.length > 0) buildings.push(info);
  }
  // Une case peut avoir été recouverte par un bâtiment voisin : on ne garde que les cases encore possédées.
  buildings.forEach((b, bi) => {
    b.cells = b.cells.filter((i) => owner[i] === bi);
  });

  // 4. Plus grande zone marchable connexe (les cours fermées en sont exclues).
  const component = new Int32Array(size).fill(-1);
  let mainComponent = -1;
  let mainSize = 0;
  for (let start = 0, label = 0; start < size; start++) {
    if (component[start] !== -1 || !WALKABLE_TILES.has(tiles[start]!)) continue;
    const queue = [start];
    component[start] = label;
    let count = 0;
    while (queue.length > 0) {
      const i = queue.pop()!;
      count++;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (component[ni] === -1 && WALKABLE_TILES.has(tiles[ni]!)) {
          component[ni] = label;
          queue.push(ni);
        }
      }
    }
    if (count > mainSize) {
      mainSize = count;
      mainComponent = label;
    }
    label++;
  }
  const inMain = (i: number) => component[i] === mainComponent;

  const toPoint = (i: number): TilePoint => ({ x: i % width, y: Math.floor(i / width) });
  const centroid = (cells: number[]): Pt => {
    let sx = 0;
    let sy = 0;
    for (const i of cells) {
      sx += i % width;
      sy += Math.floor(i / width);
    }
    return { x: sx / cells.length, y: sy / cells.length };
  };

  /** Case marchable devant un bâtiment, de préférence côté rue. */
  const findDoor = (b: BuildingInfo): TilePoint | null => {
    const c = centroid(b.cells);
    let best: { i: number; score: number } | null = null;
    for (const i of b.cells) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!inMain(ni)) continue;
        const street = tiles[ni] === TILE.road || tiles[ni] === TILE.majorRoad || tiles[ni] === TILE.pedestrian;
        const score = Math.hypot(nx - c.x, ny - c.y) - (street ? 100 : 0);
        if (!best || score < best.score) best = { i: ni, score };
      }
    }
    return best ? toPoint(best.i) : null;
  };

  // 5. Lieux notables.
  const pois: MapPoi[] = [];
  const addPoi = (kind: MapPoi['kind'], name: string | undefined, p: Pt | null) => {
    if (!name || !p) return;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (pois.some((q) => q.kind === kind && q.name === name)) return;
    pois.push({ kind, name, x, y });
  };
  const poiKind = (t: Tags): MapPoi['kind'] | null => {
    if (t.amenity === 'townhall') return 'townhall';
    if (t.railway === 'station' || (t.public_transport === 'station' && t.train === 'yes')) return 'station';
    if (t.leisure === 'park') return 'park';
    if (t.amenity === 'school') return 'school';
    if (t.amenity === 'place_of_worship') return 'worship';
    if (t.amenity === 'marketplace') return 'market';
    return null;
  };
  for (const n of osm.nodes.values()) {
    const k = poiKind(n.tags);
    if (k) addPoi(k, n.tags.name, project(n.lat, n.lon));
  }
  for (const a of areas) {
    const k = poiKind(a.tags);
    const ring = a.rings[0];
    if (!k || !ring || ring.length === 0) continue;
    addPoi(k, a.tags.name, { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length });
  }

  const townhall = pois.find((p) => p.kind === 'townhall') ?? { x: width / 2, y: height / 2 };

  /** Nom de la rue nommée la plus proche d'un point. */
  const namedStreets = roads.filter((w) => w.tags.name).map((w) => ({ name: w.tags.name!, pts: wayPoints(w) }));
  const nearestStreet = (p: Pt): string | null => {
    let best: { name: string; dist: number } | null = null;
    for (const s of namedStreets) {
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const a = s.pts[i]!;
        const b = s.pts[i + 1]!;
        const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
        const dist = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
        if (!best || dist < best.dist) best = { name: s.name, dist };
      }
    }
    return best?.name ?? null;
  };

  // 6. Zone d'appartements de départ : les immeubles les plus proches de la mairie.
  const starters: StarterBuilding[] = [];
  const candidates = buildings
    .filter((b) => b.code === TILE.apartments && b.levels >= STARTER_MIN_LEVELS && b.cells.length >= STARTER_MIN_CELLS)
    .map((b) => ({ b, c: centroid(b.cells) }))
    .sort((p, q) => Math.hypot(p.c.x - townhall.x, p.c.y - townhall.y) - Math.hypot(q.c.x - townhall.x, q.c.y - townhall.y));
  for (const { b } of candidates) {
    if (starters.length >= STARTER_BUILDING_COUNT) break;
    const door = findDoor(b);
    if (!door) continue;
    const t = b.tags;
    const address = t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : null;
    starters.push({
      id: b.id,
      name: t.name ?? address ?? `Résidence ${starters.length + 1}, ${nearestStreet({ x: door.x + 0.5, y: door.y + 0.5 }) ?? d.districtName}`,
      levels: b.levels,
      door,
    });
    for (const i of b.cells) tiles[i] = TILE.starter;
  }
  if (starters.length === 0) throw new Error(`Aucun immeuble de départ trouvé pour ${d.districtId}`);

  // 7. Point d'apparition : devant la mairie.
  let spawn = starters[0]!.door;
  let bestDist = Infinity;
  for (let i = 0; i < size; i++) {
    if (!inMain(i)) continue;
    const p = toPoint(i);
    const dist = Math.hypot(p.x - townhall.x, p.y - townhall.y);
    if (dist < bestDist) {
      bestDist = dist;
      spawn = p;
    }
  }

  const rows: string[] = [];
  const levelRows: string[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(tiles.slice(y * width, (y + 1) * width).join(''));
    levelRows.push(Array.from(levels.subarray(y * width, (y + 1) * width)).join(''));
  }

  return {
    cityId: d.cityId,
    cityName: d.cityName,
    districtId: d.districtId,
    districtName: d.districtName,
    width,
    height,
    cellSizeMeters: CELL_SIZE_METERS,
    tiles: rows,
    levels: levelRows,
    starterBuildings: starters,
    pois,
    spawn,
    attribution: '© les contributeurs d’OpenStreetMap (ODbL)',
    source: { bbox: d.bbox, fetchedAt: new Date().toISOString().slice(0, 10) },
  };
}

for (const d of DISTRICTS) {
  const xml = await readFile(join(root, 'data', osmFileName(d)), 'utf8');
  const map = buildDistrict(d, parseOsm(xml));
  const json = JSON.stringify(map, null, 1);
  await writeFile(join(outDir, mapFileName(d)), `${json}\n`);
  const counts: Record<string, number> = {};
  for (const row of map.tiles) for (const c of row) counts[c] = (counts[c] ?? 0) + 1;
  console.log(`${d.cityName} / ${d.districtName} : ${map.width}×${map.height} cases`, counts);
  console.log('  Immeubles de départ :', map.starterBuildings.map((s) => s.name).join(' | '));
  console.log('  Lieux :', map.pois.map((p) => `${p.kind}:${p.name}`).join(' | '));
}
