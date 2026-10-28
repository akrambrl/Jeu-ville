/**
 * Bâtiments en 3D. Les immeubles, équipements et commerces sont construits case
 * par case (façades texturées, regroupées en quelques gros maillages) ; les
 * pavillons utilisent les modèles Kenney.
 */
import * as THREE from 'three';
import { DECOR, SHAPE, TILE, type MapGrid, type Storefront } from '@jeu-ville/shared';
import { cloneModel, enableShadows, loadModel, modelNames } from './assets.js';
import { groundTop } from './ground.js';
import { glowAtNight, litStorefrontTexture, litWindowsTexture } from './night.js';
import {
  type FacadeStyle,
  type FrontStyle,
  canvasTexture,
  facadeTexture,
  roofTexture,
  signTexture,
  storefrontTexture,
} from './textures.js';

/** Hauteur d'un étage (1 case = 1 unité). */
export const LEVEL_H = 0.42;

const APARTMENT_WALLS = ['#e9e1d3', '#f0d9c4', '#dfe6dc', '#e9d6d2', '#d9dde6'];

const FACADES: Record<string, FacadeStyle> = {
  [TILE.starter]: { wall: '#9fd8cb', balcony: true },
  [TILE.commercial]: { wall: '#f2dcc0', shutters: '#5b7f9e' },
  [TILE.civic]: { wall: '#f4dfa6', wide: true, band: '#f2a33a' },
  [TILE.townhall]: { wall: '#f1e7d2', arched: true, band: '#fbf6ea' },
  [TILE.worship]: { wall: '#d9cdb4', arched: true, window: '#5a7bd0', frame: '#bfb197' },
  [TILE.station]: { wall: '#e7d8bf', arched: true, band: '#cdbb98' },
  [TILE.police]: { wall: '#eef1f5', band: '#1f3f8c' },
  [TILE.supermarket]: { wall: '#f1efe8', wide: true, window: '#cfd6dc', band: '#2f8f5b' },
  [TILE.building]: { wall: '#e8d3b0' },
  [TILE.industrial]: { wall: '#b7aea3' },
};

const ROOFS: Record<string, [string, string?]> = {
  default: ['#9aa0a8'],
  [TILE.townhall]: ['#4a6a8c', 'rgba(255,255,255,0.12)'],
  [TILE.worship]: ['#5b6470', 'rgba(255,255,255,0.1)'],
  [TILE.station]: ['#7d8794', 'rgba(255,255,255,0.12)'],
  [TILE.supermarket]: ['#c9ced3'],
};

const FRONTS: Record<Storefront['kind'], Omit<FrontStyle, 'sign'>> = {
  bakery: { wall: '#6e3f22', signBg: '#4a2614', signFg: '#ffd98a', glass: '#f3c97a', awning: ['#b5763a', '#f6ecd8'] },
  pharmacy: { wall: '#f4f7f4', signBg: '#2f9e5b', signFg: '#ffffff', glass: '#bfe3d0', cross: true },
  fastfood: { wall: '#c8322b', signBg: '#8f1d18', signFg: '#ffd36b', glass: '#2c3b4d', awning: ['#c8322b', '#ffffff'] },
  police: { wall: '#eef1f5', signBg: '#1f3f8c', signFg: '#ffffff', glass: '#9fb6d6' },
  cycles: { wall: '#2d6a4f', signBg: '#1b4332', signFg: '#d8f3dc', glass: '#3d5570', awning: ['#2d6a4f', '#f4efe6'] },
  petshop: { wall: '#f2c14e', signBg: '#7b4b2a', signFg: '#fff3d6', glass: '#3d5570', awning: ['#e07a2f', '#fff3d6'] },
  realestate: { wall: '#f4f1ea', signBg: '#1d3557', signFg: '#f1faee', glass: '#9fb6c9' },
  jobcenter: { wall: '#eef3f8', signBg: '#2b59a3', signFg: '#ffffff', glass: '#9fb6d6' },
};

/** Quadrilatères regroupés par matériau, fusionnés en un maillage chacun. */
class QuadBatch {
  private readonly groups = new Map<string, { mat: THREE.Material; pos: number[]; nor: number[]; uv: number[] }>();

  add(key: string, mat: () => THREE.Material, corners: THREE.Vector3[], normal: THREE.Vector3, u: number, v: number): void {
    let g = this.groups.get(key);
    if (!g) {
      g = { mat: mat(), pos: [], nor: [], uv: [] };
      this.groups.set(key, g);
    }
    const [a, b, c, d] = corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const uvs = [[0, 0], [u, 0], [u, v], [0, v]] as const;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = [a, b, c, d][k]!;
      g.pos.push(p.x, p.y, p.z);
      g.nor.push(normal.x, normal.y, normal.z);
      g.uv.push(uvs[k]![0], uvs[k]![1]);
    }
  }

  build(): THREE.Group {
    const out = new THREE.Group();
    for (const g of this.groups.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      const mesh = new THREE.Mesh(geo, g.mat);
      mesh.castShadow = mesh.receiveShadow = true;
      out.add(mesh);
    }
    return out;
  }
}

const materials = new Map<string, THREE.Material>();
/** `lit` : texture des parties qui s'allument la nuit (fenêtres, vitrines). */
function mat(key: string, make: () => THREE.Texture | THREE.Color, lit?: () => THREE.Texture): () => THREE.Material {
  return () => {
    let m = materials.get(key);
    if (!m) {
      const t = make();
      const std =
        t instanceof THREE.Color ? new THREE.MeshStandardMaterial({ color: t, roughness: 0.85 }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
      if (lit) {
        std.emissive = new THREE.Color(0xffffff);
        std.emissiveMap = lit();
        glowAtNight(std, 1.4);
      }
      m = std;
      materials.set(key, m);
    }
    return m;
  };
}

/** Les 4 côtés d'une case : direction, normale et coins (de gauche à droite vus de dehors). */
const SIDES = [
  { dx: 0, dy: 1, n: new THREE.Vector3(0, 0, 1), a: [-0.5, 0.5], b: [0.5, 0.5] }, // sud (+z)
  { dx: 1, dy: 0, n: new THREE.Vector3(1, 0, 0), a: [0.5, 0.5], b: [0.5, -0.5] }, // est (+x)
  { dx: 0, dy: -1, n: new THREE.Vector3(0, 0, -1), a: [0.5, -0.5], b: [-0.5, -0.5] }, // nord
  { dx: -1, dy: 0, n: new THREE.Vector3(-1, 0, 0), a: [-0.5, -0.5], b: [-0.5, 0.5] }, // ouest
] as const;

export interface BuildingsResult {
  group: THREE.Group;
  /** Hauteur du toit de chaque case de bâtiment (pour poser drapeaux, étiquettes…). */
  roofHeight: (x: number, y: number) => number;
}

export async function buildBuildings(grid: MapGrid, storefronts: Storefront[]): Promise<BuildingsResult> {
  const group = new THREE.Group();
  const quads = new QuadBatch();
  rims = new RimBatch();
  const fronts = new Map(storefronts.map((f) => [`${f.x},${f.y}`, f]));
  const extras = new THREE.Group();
  const houseJobs: Promise<void>[] = [];
  const houseModels = modelNames('houses').filter((n) => n.startsWith('building-type-'));

  const roofHeight = (x: number, y: number) => groundTop(grid.tileAt(x, y)) + Math.max(1, grid.levelsAt(x, y)) * LEVEL_H;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const code = grid.tileAt(x, y);
      if (code === TILE.house) {
        // Un pavillon Kenney par maison 2×2 (posé depuis sa case nord-ouest).
        const lx = (x % 10) - 2;
        if (grid.shapeAt(x, y) === SHAPE.roofNorth && lx % 2 === 1) {
          const h = (x * 31 + y * 17) % 997;
          houseJobs.push(placeHouse(extras, houseModels[h % houseModels.length]!, x + 0.5, y + 0.5, h));
        }
        continue;
      }
      if (!grid.isBuilding(x, y)) continue;
      addColumn(grid, quads, extras, x, y, fronts.get(`${x},${y}`));
    }
  }
  await Promise.all(houseJobs);
  group.add(quads.build(), rims.build(), extras);
  return { group, roofHeight };
}

function addColumn(grid: MapGrid, quads: QuadBatch, extras: THREE.Group, x: number, y: number, front?: Storefront): void {
  const code = grid.tileAt(x, y);
  const shape = grid.shapeAt(x, y);
  const levels = Math.max(1, grid.levelsAt(x, y));
  const base = groundTop(code);
  const top = base + levels * LEVEL_H;
  const same = (nx: number, ny: number) => grid.tileAt(nx, ny) === code && grid.levelsAt(nx, ny) === grid.levelsAt(x, y);

  const variant = (Math.floor(x / 10) * 7 + Math.floor(y / 10) * 13) % APARTMENT_WALLS.length;
  const facade: FacadeStyle =
    code === TILE.apartments ? { wall: APARTMENT_WALLS[variant]!, balcony: true } : (FACADES[code] ?? FACADES[TILE.building]!);
  const facadeKey = `facade-${code}-${code === TILE.apartments ? variant : ''}`;
  const upper = mat(
    facadeKey,
    () => facadeTexture(facade),
    () => litWindowsTexture(!!facade.wide, 1 + [...facadeKey].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100_000, 7)),
  );

  // Rez-de-chaussée : vitrine, entrée, ou façade normale.
  let groundKey = facadeKey;
  let ground = upper;
  const frontStyle = groundFloor(code, shape, front);
  if (frontStyle) {
    groundKey = `front-${JSON.stringify(frontStyle)}`;
    ground = mat(groundKey, () => storefrontTexture(frontStyle), litStorefrontTexture);
  }

  for (const s of SIDES) {
    if (same(x + s.dx, y + s.dy)) continue;
    const a = new THREE.Vector3(x + s.a[0], 0, y + s.a[1]);
    const b = new THREE.Vector3(x + s.b[0], 0, y + s.b[1]);
    const at = (p: THREE.Vector3, h: number) => new THREE.Vector3(p.x, h, p.z);
    // Les vitrines et enseignes ne vont que sur les faces visibles (sud, est).
    const front = s.dy === 1 || s.dx === 1;
    const g0 = base;
    const g1 = base + LEVEL_H;
    quads.add(front ? groundKey : facadeKey, front ? ground : upper, [at(a, g0), at(b, g0), at(b, g1), at(a, g1)], s.n, 1, 1);
    if (levels > 1) quads.add(facadeKey, upper, [at(a, g1), at(b, g1), at(b, top), at(a, top)], s.n, 1, levels - 1);
  }

  // Toit
  const [roofColor, roofLines] = ROOFS[code] ?? ROOFS.default!;
  const roofMat = mat(`roof-${code}`, () => roofTexture(roofColor, roofLines));
  quads.add(
    `roof-${code}`,
    roofMat,
    [new THREE.Vector3(x - 0.5, top, y + 0.5), new THREE.Vector3(x + 0.5, top, y + 0.5), new THREE.Vector3(x + 0.5, top, y - 0.5), new THREE.Vector3(x - 0.5, top, y - 0.5)],
    new THREE.Vector3(0, 1, 0),
    1,
    1,
  );
  // Acrotère (rebord) sur les côtés en façade, pour les toits plats.
  const flat = code !== TILE.townhall && code !== TILE.worship && code !== TILE.station;
  if (flat) {
    for (const s of SIDES) {
      if (same(x + s.dx, y + s.dy)) continue;
      rims.add(
        `roof-${code}`,
        roofMat,
        new THREE.Matrix4()
          .makeScale(s.dx === 0 ? 1 : 0.08, 1, s.dy === 0 ? 1 : 0.08)
          .setPosition(x + s.dx * 0.46, top + 0.04, y + s.dy * 0.46),
      );
    }
  } else {
    addPitchedRoof(grid, extras, x, y, code, shape, top, roofMat, same);
  }

  if (shape === SHAPE.townhallCenter) addTownhallFront(extras, x, y, top, base);
  if (shape === SHAPE.stationCenter) addSign(extras, x, y, base + LEVEL_H * 1.6, 'GARE · RER E', '#24324a', '#ffffff', 1.1, true);
  if (shape === SHAPE.facadeSign && code === TILE.police) addSign(extras, x, y, top - 0.12, 'POLICE', '#1f3f8c', '#ffffff', 1);
  if (shape === SHAPE.facadeSign && code === TILE.supermarket) addSign(extras, x, y, top + 0.14, 'SUPERMARCHÉ', '#2f8f5b', '#ffffff', 1.6);
  const custom = grid.map.signs.find((g) => g.x === x && g.y === y)?.text;
  if (shape === SHAPE.facadeSign && code === TILE.civic && custom) addSign(extras, x, y, top - 0.15, custom, '#c2462e', '#ffffff', 1.1);
  if (shape === SHAPE.schoolSign) {
    const text = custom ?? 'ÉCOLE';
    addSign(extras, x, y, top - 0.15, text, '#1f4e8c', '#ffffff', Math.max(0.9, text.length * 0.1));
  }
  if (grid.decorAt(x, y) === DECOR.flag) addFlag(extras, x, y, top + (shape === SHAPE.townhallCenter ? 0.35 : 0));
}

const RIM_GEOMETRY = new THREE.BoxGeometry(1, 0.08, 1);

/** Rebords de toits, regroupés par matériau en InstancedMesh. */
class RimBatch {
  private readonly items = new Map<string, { mat: () => THREE.Material; list: THREE.Matrix4[] }>();

  add(key: string, mat: () => THREE.Material, m: THREE.Matrix4): void {
    const entry = this.items.get(key) ?? { mat, list: [] };
    entry.list.push(m);
    this.items.set(key, entry);
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    for (const { mat, list } of this.items.values()) {
      const mesh = new THREE.InstancedMesh(RIM_GEOMETRY, mat(), list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      g.add(mesh);
    }
    return g;
  }
}
let rims = new RimBatch();

function groundFloor(code: string, shape: string, front?: Storefront): FrontStyle | null {
  if (shape === SHAPE.storefront && front) return { ...FRONTS[front.kind], sign: front.sign };
  if (code === TILE.commercial) {
    return { wall: '#8a6f55', sign: 'BOUTIQUE', signBg: '#3b4a5c', signFg: '#f6ecd8', awning: ['#3b6ea8', '#f4efe6'] };
  }
  if (shape === SHAPE.entrance && (code === TILE.apartments || code === TILE.starter)) {
    return { wall: code === TILE.starter ? '#7fbfb2' : '#cfc7b8', sign: '', signBg: 'rgba(0,0,0,0)', signFg: '#000', glass: '#3d5570', door: '#6b7c8f' };
  }
  if (code === TILE.supermarket && (shape === SHAPE.entrance || shape === SHAPE.facadeSign)) {
    return { wall: '#f1efe8', sign: '', signBg: '#2f8f5b', signFg: '#fff', glass: '#9fb6c9', door: '#6b8aa3' };
  }
  if (code === TILE.station && (shape === SHAPE.entrance || shape === SHAPE.stationCenter)) {
    return { wall: '#e7d8bf', sign: '', signBg: '#cdbb98', signFg: '#fff', glass: '#3d5570' };
  }
  if (code === TILE.police && shape === SHAPE.facadeSign) {
    return { wall: '#eef1f5', sign: 'COMMISSARIAT', signBg: '#1f3f8c', signFg: '#ffffff', glass: '#9fb6d6' };
  }
  if (code === TILE.worship && shape === SHAPE.entrance) {
    return { wall: '#d9cdb4', sign: '', signBg: '#bfb197', signFg: '#fff', glass: '#5b3b2a', door: '#5b3b2a' };
  }
  return null;
}

/** Toits en pente : nef d'église (deux pans), brisis de mairie et de gare, flèche du clocher. */
function addPitchedRoof(
  grid: MapGrid,
  extras: THREE.Group,
  x: number,
  y: number,
  code: string,
  shape: string,
  top: number,
  roofMat: () => THREE.Material,
  same: (x: number, y: number) => boolean,
): void {
  if (shape === SHAPE.belfry) {
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 4), roofMat());
    spire.rotation.y = Math.PI / 4;
    spire.position.set(x, top + 0.7, y);
    spire.castShadow = true;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), new THREE.MeshStandardMaterial({ color: 0xd9b44a }));
    cross.position.set(x, top + 1.55, y);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), cross.material);
    arm.position.set(x, top + 1.6, y);
    extras.add(spire, cross, arm);
    return;
  }
  if (shape === SHAPE.roofWest) {
    // Nef : prisme couvrant cette case et sa voisine est, faîtage selon y.
    const prism = new THREE.Shape([new THREE.Vector2(-1.05, 0), new THREE.Vector2(1.05, 0), new THREE.Vector2(0, 0.7)]);
    const geo = new THREE.ExtrudeGeometry(prism, { depth: 1.02, bevelEnabled: false });
    const roof = new THREE.Mesh(geo, roofMat());
    roof.position.set(x + 0.5, top, y - 0.51);
    roof.castShadow = roof.receiveShadow = true;
    extras.add(roof);
    return;
  }
  if (shape === SHAPE.roofEast || shape === SHAPE.entrance) return;
  // Brisis (Mansart) : bloc en retrait sur les côtés en façade, empilé sur le toit.
  const inset = (dx: number, dy: number) => (same(x + dx, y + dy) ? 0 : 0.18);
  const w = 1 - inset(-1, 0) - inset(1, 0);
  const d = 1 - inset(0, -1) - inset(0, 1);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), roofMat());
  cap.position.set(x + (inset(-1, 0) - inset(1, 0)) / 2, top + 0.11, y + (inset(0, -1) - inset(0, 1)) / 2);
  cap.castShadow = cap.receiveShadow = true;
  extras.add(cap);
  // Lucarne côté sud.
  if (!same(x, y + 1) && code === TILE.townhall && shape !== SHAPE.townhallCenter) {
    const dormer = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0xe9e2d0 }));
    dormer.position.set(x, top + 0.1, y + 0.36);
    extras.add(dormer);
  }
  void grid;
}

function addSign(extras: THREE.Group, x: number, y: number, h: number, text: string, bg: string, fg: string, width: number, clock = false): void {
  const tex = signTexture(text, bg, fg, (c) => {
    if (!clock) return;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(232, 32, 20, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#24324a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(232, 32);
    c.lineTo(232, 18);
    c.moveTo(232, 32);
    c.lineTo(242, 36);
    c.stroke();
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  sign.position.set(x, h, y + 0.52);
  extras.add(sign);
}

function addTownhallFront(extras: THREE.Group, x: number, y: number, top: number, base: number): void {
  const white = new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.7 });
  // Colonnes et fronton.
  for (const dx of [-0.38, -0.14, 0.14, 0.38]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, LEVEL_H * 2, 10), white);
    col.position.set(x + dx, base + LEVEL_H, y + 0.6);
    col.castShadow = true;
    extras.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.1, 0.24), white);
  lintel.position.set(x, base + LEVEL_H * 2 + 0.05, y + 0.56);
  extras.add(lintel);
  const pediment = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.55, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 0.32)]), {
      depth: 0.12,
      bevelEnabled: false,
    }),
    white,
  );
  pediment.position.set(x, top, y + 0.42);
  pediment.castShadow = true;
  extras.add(pediment);
  addSign(extras, x, y, base + LEVEL_H * 2 + 0.22, 'MAIRIE', '#fbf7ee', '#3b4a5c', 0.8);
  // Horloge
  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 24),
    new THREE.MeshStandardMaterial({
      map: canvasTexture(64, 64, (c) => {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(32, 32, 30, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#2d3a4a';
        c.lineWidth = 4;
        c.stroke();
        c.beginPath();
        c.moveTo(32, 32);
        c.lineTo(32, 12);
        c.moveTo(32, 32);
        c.lineTo(46, 38);
        c.stroke();
      }),
    }),
  );
  clock.position.set(x, top - 0.2, y + 0.51);
  extras.add(clock);
}

function addFlag(extras: THREE.Group, x: number, y: number, h: number): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0xdcdcdc }));
  pole.position.set(x, h + 0.4, y);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.28),
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      map: canvasTexture(48, 32, (c) => {
        ['#1f4ea8', '#ffffff', '#e1373c'].forEach((col, k) => {
          c.fillStyle = col;
          c.fillRect(k * 16, 0, 16, 32);
        });
      }),
    }),
  );
  flag.position.set(x + 0.22, h + 0.64, y);
  flag.castShadow = true;
  extras.add(pole, flag);
}

// ---------- Pavillons (modèles Kenney) ----------

/** Couleurs de toit possibles (le vert d'origine des modèles est remplacé). */
const ROOF_TINTS: [number, number, number][] = [
  [196, 96, 66],
  [150, 80, 60],
  [95, 104, 120],
  [176, 120, 72],
];
const tintedMaps = new Map<string, THREE.Texture>();

function tinted(map: THREE.Texture, tint: [number, number, number]): THREE.Texture {
  const key = `${map.uuid}-${tint.join(',')}`;
  let t = tintedMaps.get(key);
  if (!t) {
    const img = map.image as HTMLImageElement | ImageBitmap;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i]!;
      const gg = d.data[i + 1]!;
      const b = d.data[i + 2]!;
      if (gg > r + 30 && gg > b + 10) {
        const f = gg / 200;
        d.data[i] = tint[0] * f;
        d.data[i + 1] = tint[1] * f;
        d.data[i + 2] = tint[2] * f;
      }
    }
    g.putImageData(d, 0, 0);
    t = new THREE.CanvasTexture(c);
    t.flipY = map.flipY;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = map.magFilter;
    t.minFilter = map.minFilter;
    tintedMaps.set(key, t);
  }
  return t;
}

async function placeHouse(parent: THREE.Group, name: string, x: number, y: number, h: number): Promise<void> {
  const model = cloneModel(await loadModel('houses', name));
  const tint = ROOF_TINTS[h % ROOF_TINTS.length]!;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (m.map) m.map = tinted(m.map, tint);
    mesh.material = m;
  });
  // Façade (porte) vers le sud, face à la caméra.
  model.rotation.y = Math.PI;
  const box = new THREE.Box3().setFromObject(model);
  const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const s = 1.85 / size;
  model.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(model);
  model.position.set(x - (b2.min.x + b2.max.x) / 2, 0.05 - b2.min.y, y - (b2.min.z + b2.max.z) / 2);
  enableShadows(model);
  parent.add(model);
}
