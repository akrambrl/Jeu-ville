/** Sol de la ville : dalles par type de case, marquages, rails, fleurs. */
import * as THREE from 'three';
import { BUILDING_TILES, DECOR, TILE, type MapGrid } from '@jeu-ville/shared';
import { GROUND_TEXTURES, seeded } from './textures.js';

/** Hauteur du dessus du sol par type (la chaussée est à 0). */
export const GROUND_TOP: Record<string, number> = {
  [TILE.road]: 0,
  [TILE.majorRoad]: 0,
  [TILE.rail]: 0.02,
  [TILE.pedestrian]: 0.05,
  [TILE.grass]: 0.05,
  [TILE.ground]: 0.05,
  [TILE.yard]: 0.05,
  [TILE.water]: -0.05,
  [TILE.platform]: 0.14,
};

export function groundTop(code: string): number {
  return BUILDING_TILES.has(code) ? GROUND_TOP[TILE.pedestrian]! : (GROUND_TOP[code] ?? 0.05);
}

const SURFACES: Record<string, () => THREE.Texture> = {
  [TILE.grass]: GROUND_TEXTURES.grass,
  [TILE.ground]: GROUND_TEXTURES.grass,
  [TILE.pedestrian]: GROUND_TEXTURES.sidewalk,
  [TILE.road]: GROUND_TEXTURES.road,
  [TILE.majorRoad]: GROUND_TEXTURES.majorRoad,
  [TILE.yard]: GROUND_TEXTURES.yard,
  [TILE.rail]: GROUND_TEXTURES.rail,
  [TILE.platform]: GROUND_TEXTURES.platform,
};

const BASE = -0.3;

export function buildGround(grid: MapGrid): THREE.Group {
  const group = new THREE.Group();
  const byCode = new Map<string, [number, number][]>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const raw = grid.tileAt(x, y);
      const code = BUILDING_TILES.has(raw) ? TILE.pedestrian : SURFACES[raw] ? raw : TILE.pedestrian;
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push([x, y]);
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (const [code, cells] of byCode) {
    const top = GROUND_TOP[code] ?? 0.05;
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: SURFACES[code]!(), roughness: 0.95 }), cells.length);
    mesh.receiveShadow = true;
    cells.forEach(([x, y], i) => {
      m.makeScale(1, top - BASE, 1).setPosition(x, (top + BASE) / 2, y);
      mesh.setMatrixAt(i, m);
      // Herbe et trottoirs en damier, façon plateau de jeu.
      const checker = (code === TILE.grass || code === TILE.ground || code === TILE.pedestrian) && (x + y) % 2 === 0;
      color.setRGB(1, 1, 1).offsetHSL(0, 0, checker ? -0.06 : 0);
      mesh.setColorAt(i, color);
    });
    group.add(mesh);
  }
  group.add(buildMarkings(grid));
  return group;
}

/** Petites pièces plates posées au sol, regroupées par couleur. */
class FlatBatch {
  private readonly items = new Map<number, THREE.Matrix4[]>();

  add(color: number, x: number, y: number, z: number, w: number, d: number, h = 0.012): void {
    const list = this.items.get(color) ?? [];
    list.push(new THREE.Matrix4().makeScale(w, h, d).setPosition(x, y + h / 2, z));
    this.items.set(color, list);
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (const [color, mats] of this.items) {
      const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), mats.length);
      mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

const WHITE = 0xf3f2ec;
const RAIL = 0x7a808a;
const TRAM_BED = 0xb9b9b2;

function buildMarkings(grid: MapGrid): THREE.Group {
  const b = new FlatBatch();
  const r = seeded(11);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const d = grid.decorAt(x, y);
      const top = groundTop(grid.tileAt(x, y));
      switch (d) {
        case DECOR.laneX:
          b.add(WHITE, x, top, y + 0.5, 0.5, 0.07);
          break;
        case DECOR.laneY:
          b.add(WHITE, x + 0.5, top, y, 0.07, 0.5);
          break;
        case DECOR.crossingX:
          for (const k of [-0.33, -0.11, 0.11, 0.33]) b.add(WHITE, x, top, y + k, 0.7, 0.12);
          break;
        case DECOR.crossingY:
          for (const k of [-0.33, -0.11, 0.11, 0.33]) b.add(WHITE, x + k, top, y, 0.12, 0.7);
          break;
        case DECOR.railCrossing:
          for (const k of [-0.2, 0.2]) b.add(RAIL, x, top, y + k, 1, 0.05, 0.03);
          break;
        case DECOR.parking:
          b.add(WHITE, x - 0.48, top, y, 0.04, 0.9);
          b.add(WHITE, x, top, y + 0.42, 1, 0.04);
          break;
        case DECOR.flowers:
          for (let i = 0; i < 8; i++) {
            const c = [0xf2d14b, 0xe8607a, 0xffffff, 0xb07ce0][i % 4]!;
            b.add(c, x + (r() - 0.5) * 0.8, top, y + (r() - 0.5) * 0.8, 0.08, 0.08, 0.05);
          }
          break;
        case DECOR.hopscotch:
          [0xf2d14b, 0xe8607a, 0x5fb3e0, 0x7fcf7a].forEach((c, k) => b.add(c, x - 0.3 + k * 0.2, top, y, 0.16, 0.18));
          break;
        default: {
          // Rails de tram : codes 1→8 (voir DECOR.tram*).
          const tram = TRAM[d];
          if (!tram) break;
          for (const [axis, side] of tram) {
            const s = side === 'a' ? 1 : -1;
            if (axis === 'x') {
              b.add(TRAM_BED, x, top, y + s * 0.4, 1, 0.2, 0.008);
              b.add(RAIL, x, top, y + s * 0.34, 1, 0.04, 0.025);
            } else {
              b.add(TRAM_BED, x + s * 0.4, top, y, 0.2, 1, 0.008);
              b.add(RAIL, x + s * 0.34, top, y, 0.04, 1, 0.025);
            }
          }
        }
      }
    }
  }
  addCycleways(b, grid);
  return b.build();
}

const BIKE_GREEN = 0x3fae5a;

/** Bandes cyclables vertes le long des deux bords de la chaussée, avec pictogramme vélo. */
function addCycleways(b: FlatBatch, grid: MapGrid): void {
  for (const c of grid.map.cycleways) {
    // On s'arrête avant les passages piétons des extrémités.
    const from = (c.axis === 'x' ? c.x : c.y) + 0.5;
    const len = c.length - 2;
    const mid = from + len / 2;
    for (const edge of [-0.5 + 0.14, 1.5 - 0.14]) {
      const across = (c.axis === 'x' ? c.y : c.x) + edge;
      const top = groundTop(grid.tileAt(c.axis === 'x' ? Math.round(mid) : c.x, c.axis === 'x' ? c.y : Math.round(mid)));
      if (c.axis === 'x') b.add(BIKE_GREEN, mid, top, across, len, 0.24, 0.014);
      else b.add(BIKE_GREEN, across, top, mid, 0.24, len, 0.014);
      // Pictogramme : deux roues et un cadre, tous les 3 cases.
      for (let k = from + 1; k < from + len - 0.5; k += 3) {
        const parts: [number, number, number, number][] = [
          [-0.07, 0, 0.07, 0.07],
          [0.07, 0, 0.07, 0.07],
          [0, 0, 0.12, 0.02],
        ];
        for (const [da, dc, wa, wc] of parts) {
          if (c.axis === 'x') b.add(WHITE, k + da, top + 0.002, across + dc, wa, wc, 0.016);
          else b.add(WHITE, across + dc, top + 0.002, k + da, wc, wa, 0.016);
        }
      }
    }
  }
}

const TRAM: Record<string, ['x' | 'y', 'a' | 'b'][]> = {
  [DECOR.tramXa]: [['x', 'a']],
  [DECOR.tramXb]: [['x', 'b']],
  [DECOR.tramYa]: [['y', 'a']],
  [DECOR.tramYb]: [['y', 'b']],
  [DECOR.tramXaYa]: [['x', 'a'], ['y', 'a']],
  [DECOR.tramXaYb]: [['x', 'a'], ['y', 'b']],
  [DECOR.tramXbYa]: [['x', 'b'], ['y', 'a']],
  [DECOR.tramXbYb]: [['x', 'b'], ['y', 'b']],
};
