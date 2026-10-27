/**
 * Vie de quartier décorative : tram T1, RER, enfants dans les cours d'école.
 * Rien de tout cela n'est de l'état de jeu (les transports deviendront
 * exploitables en phase 7).
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DECOR, TILE, type MapGrid, type MapPoi, type TilePoint, type Transit } from '@jeu-ville/shared';
import { Character3D } from './characters.js';
import { groundTop } from './ground.js';

const TRAM_SPEED = 1.6;
const TRAM_DWELL = 4;
const TRAM_CARS = 3;
const TRAM_CAR_LEN = 1.05;
const TRAIN_SPEED = 5;
const TRAIN_STATION_SPEED = 1.6;
const TRAIN_DWELL = 3.5;
const TRAIN_CARS = 5;
const TRAIN_CAR_LEN = 1.6;
const TRAIN_GAP: [number, number] = [6, 20];
const KIDS_PER_YARD = 6;
/** Vendeurs de maïs chaud : combien autour de la gare et de l'arrêt de tram. */
const CORN_VENDORS: { near: MapPoi['kind']; count: number }[] = [
  { near: 'station', count: 2 },
  { near: 'tram', count: 1 },
];
const VENDOR_SEARCH_RADIUS = 6;
const VENDOR_CALL_EVERY: [number, number] = [5, 11];
const VENDOR_CALL_DURATION = 2.5;

function carMesh(length: number, width: number, height: number, body: number, band: number, doubleDeck: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), mat(body));
  shell.position.y = height / 2 + 0.06;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(length + 0.01, height * 0.12, width + 0.01), mat(band));
  stripe.position.y = 0.06 + height * 0.18;
  const windows = new THREE.Mesh(new THREE.BoxGeometry(length * 0.92, height * (doubleDeck ? 0.18 : 0.32), width + 0.012), mat(0x2c3b4d));
  windows.position.y = 0.06 + height * (doubleDeck ? 0.72 : 0.62);
  g.add(shell, stripe, windows);
  if (doubleDeck) {
    const low = windows.clone();
    low.position.y = 0.06 + height * 0.42;
    g.add(low);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length * 0.4, 0.05, width * 0.4), mat(0x8d939c));
  roof.position.y = height + 0.09;
  g.add(roof);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

export class Ambient {
  readonly group = new THREE.Group();
  private tram: {
    cars: THREE.Group[];
    path: TilePoint[];
    cum: number[];
    length: number;
    pos: number;
    dir: 1 | -1;
    stops: number[];
    dwell: number;
  } | null = null;
  private trains: { cars: THREE.Group[]; y: number; x: number; dir: 1 | -1; stopped: boolean; dwell: number }[] = [];
  private nextTrain = 2;
  private kids: { c: Character3D; yard: TilePoint[]; target: TilePoint; wait: number; run: boolean }[] = [];
  private vendors: { c: Character3D; bubble: CSS2DObject; nextCall: number; calling: number }[] = [];
  private smoke: { mesh: THREE.Mesh; base: THREE.Vector3; t: number }[] = [];

  constructor(
    private readonly grid: MapGrid,
    private readonly transit: Transit,
  ) {
    const t = transit.tram;
    if (t && t.path.length >= 2) {
      const cum = [0];
      for (let k = 1; k < t.path.length; k++) cum.push(cum[k - 1]! + Math.hypot(t.path[k]!.x - t.path[k - 1]!.x, t.path[k]!.y - t.path[k - 1]!.y));
      const length = cum.at(-1)!;
      const cars = Array.from({ length: TRAM_CARS }, () => carMesh(TRAM_CAR_LEN * 0.96, 0.55, 0.55, 0xf4f5f2, 0x2f6fb5, false));
      cars.forEach((c) => this.group.add(c));
      this.tram = { cars, path: t.path, cum, length, pos: TRAM_CARS * TRAM_CAR_LEN, dir: 1, stops: [0, ...t.stops.map((s) => s.at), length], dwell: 0 };
    }
  }

  async spawnKids(): Promise<void> {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
    let n = 0;
    for (const yard of findYards(this.grid)) {
      for (let k = 0; k < Math.min(KIDS_PER_YARD, yard.length); k++) {
        const start = yard[Math.floor(Math.random() * yard.length)]!;
        const c = new Character3D((x, y) => this.grid.tileAt(x, y), start.x, start.y, 0.5);
        await c.load(`character-${n % 2 ? 'female' : 'male'}-${letters[n % 6]}`);
        n++;
        this.group.add(c.root);
        this.kids.push({ c, yard, target: start, wait: Math.random() * 2, run: false });
      }
    }
  }

  /** Vendeurs de maïs chaud (caddie-brasero) sur le parvis de la gare et près du tram. */
  async spawnVendors(pois: MapPoi[]): Promise<void> {
    const taken: TilePoint[] = [];
    for (const { near, count } of CORN_VENDORS) {
      const poi = pois.find((p) => p.kind === near);
      if (!poi) continue;
      const spots = this.freeSidewalkNear(poi.entrance, taken).slice(0, count);
      for (const spot of spots) {
        taken.push(spot);
        await this.addCornVendor(spot, poi.entrance);
      }
    }
  }

  /** Cases de trottoir libres (sans arbre, banc…) près d'un point, des plus proches aux plus lointaines. */
  private freeSidewalkNear(center: TilePoint, taken: TilePoint[]): TilePoint[] {
    const out: { p: TilePoint; d: number }[] = [];
    const r = VENDOR_SEARCH_RADIUS;
    for (let y = center.y - r; y <= center.y + r; y++) {
      for (let x = center.x - r; x <= center.x + r; x++) {
        if (this.grid.tileAt(x, y) !== TILE.pedestrian || this.grid.decorAt(x, y) !== DECOR.none) continue;
        const d = Math.hypot(x - center.x, y - center.y);
        // Pas devant la porte, et pas collés les uns aux autres.
        if (d < 2 || taken.some((t) => Math.hypot(t.x - x, t.y - y) < 3)) continue;
        if (out.some((o) => Math.hypot(o.p.x - x, o.p.y - y) < 3)) continue;
        out.push({ p: { x, y }, d });
      }
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.p);
  }

  private async addCornVendor(spot: TilePoint, lookAt: TilePoint): Promise<void> {
    const top = groundTop(this.grid.tileAt(spot.x, spot.y));
    // Le vendeur, à côté de son caddie, tourné vers le passage.
    const vendor = new Character3D((x, y) => this.grid.tileAt(x, y), spot.x - 0.25, spot.y);
    await vendor.load(['character-male-c', 'character-male-e', 'character-female-d'][this.vendors.length % 3]!);
    const angle = Math.atan2(lookAt.x - spot.x, lookAt.y - spot.y);
    vendor.root.rotation.y = angle;
    vendor.setTarget(spot.x - 0.25, spot.y, false);
    this.group.add(vendor.root);

    const cart = cornCart();
    cart.position.set(spot.x + 0.22, top, spot.y + 0.05);
    cart.rotation.y = angle;
    this.group.add(cart);
    // Fumée du brasero.
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(SMOKE_GEOMETRY, new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0, depthWrite: false }));
      const base = new THREE.Vector3(spot.x + 0.22, top + 0.62, spot.y + 0.05);
      this.group.add(puff);
      this.smoke.push({ mesh: puff, base, t: k / 4 });
    }
    // Bulle « Maïs chaud ! ».
    const el = document.createElement('div');
    el.className = 'speech';
    el.textContent = '🌽 Maïs chaud !';
    const bubble = new CSS2DObject(el);
    bubble.position.set(0, 1.25, 0);
    bubble.visible = false;
    vendor.root.add(bubble);
    this.vendors.push({ c: vendor, bubble, nextCall: 1 + Math.random() * 4, calling: 0 });
  }

  private updateVendors(dt: number): void {
    for (const v of this.vendors) {
      v.c.update(dt);
      if (v.calling > 0) {
        v.calling -= dt;
        if (v.calling <= 0) v.bubble.visible = false;
      } else if ((v.nextCall -= dt) <= 0) {
        v.calling = VENDOR_CALL_DURATION;
        v.bubble.visible = true;
        v.nextCall = VENDOR_CALL_EVERY[0] + Math.random() * (VENDOR_CALL_EVERY[1] - VENDOR_CALL_EVERY[0]);
      }
    }
    for (const s of this.smoke) {
      s.t = (s.t + dt * 0.35) % 1;
      s.mesh.position.set(s.base.x + Math.sin(s.t * 6) * 0.05, s.base.y + s.t * 0.7, s.base.z);
      s.mesh.scale.setScalar(0.6 + s.t * 1.4);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - s.t);
    }
  }

  private tramPoint(d: number): { x: number; y: number; angle: number } {
    const t = this.tram!;
    const pos = THREE.MathUtils.clamp(d, 0, t.length);
    let k = 0;
    while (k < t.path.length - 2 && t.cum[k + 1]! < pos) k++;
    const a = t.path[k]!;
    const b = t.path[k + 1]!;
    const u = (pos - t.cum[k]!) / (t.cum[k + 1]! - t.cum[k]! || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  update(dt: number): void {
    this.updateTram(dt);
    this.updateTrains(dt);
    this.updateVendors(dt);
    for (const kid of this.kids) {
      const dx = kid.target.x - kid.c.tileX;
      const dy = kid.target.y - kid.c.tileY;
      const dist = Math.hypot(dx, dy);
      if (kid.wait > 0) {
        kid.wait -= dt;
        kid.c.setTarget(kid.c.tileX, kid.c.tileY, false);
      } else if (dist < 0.08) {
        kid.target = kid.yard[Math.floor(Math.random() * kid.yard.length)]!;
        kid.run = Math.random() < 0.6;
        kid.wait = 0.3 + Math.random() * 2;
      } else {
        const step = Math.min(dist, (kid.run ? 2.2 : 1) * dt);
        kid.c.setTarget(kid.c.tileX + (dx / dist) * step, kid.c.tileY + (dy / dist) * step, true);
      }
      kid.c.update(dt, kid.run ? 'sprint' : 'walk');
    }
  }

  private updateTram(dt: number): void {
    const t = this.tram;
    if (!t) return;
    if (t.dwell > 0) t.dwell -= dt;
    else {
      const before = t.pos;
      t.pos += t.dir * TRAM_SPEED * dt;
      const passed = t.stops.find((s) => (t.dir > 0 ? before < s && t.pos >= s : before > s && t.pos <= s));
      if (passed !== undefined) {
        t.pos = passed;
        t.dwell = TRAM_DWELL;
        if (passed <= 0 || passed >= t.length) t.dir = t.dir > 0 ? -1 : 1;
      }
    }
    const head = THREE.MathUtils.clamp(t.pos, (TRAM_CARS - 1) * TRAM_CAR_LEN, t.length);
    t.cars.forEach((car, k) => {
      const p = this.tramPoint(head - k * TRAM_CAR_LEN - TRAM_CAR_LEN / 2);
      car.position.set(p.x, 0, p.y);
      car.rotation.y = -p.angle;
    });
  }

  private updateTrains(dt: number): void {
    const rail = this.transit.rail;
    if (!rail) return;
    this.nextTrain -= dt;
    if (this.nextTrain <= 0) {
      this.nextTrain = TRAIN_GAP[0] + Math.random() * (TRAIN_GAP[1] - TRAIN_GAP[0]);
      const index = Math.floor(Math.random() * rail.tracks.length);
      const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;
      const cars = Array.from({ length: TRAIN_CARS }, () => carMesh(TRAIN_CAR_LEN * 0.97, 0.62, 0.8, 0xeef0f2, 0x1d4f9c, true));
      cars.forEach((c) => this.group.add(c));
      const span = TRAIN_CARS * TRAIN_CAR_LEN;
      this.trains.push({ cars, y: rail.tracks[index]!, x: dir > 0 ? -span : this.grid.width + span, dir, stopped: false, dwell: 0 });
    }
    for (const tr of this.trains) {
      if (tr.dwell > 0) tr.dwell -= dt;
      else {
        const station = rail.stationX;
        const near = station !== null && Math.abs(tr.x - station) < 10 && !tr.stopped;
        const before = tr.x;
        tr.x += tr.dir * (near ? TRAIN_STATION_SPEED : TRAIN_SPEED) * dt;
        if (station !== null && !tr.stopped && (before - station) * (tr.x - station) <= 0) {
          tr.stopped = true;
          tr.dwell = TRAIN_DWELL;
        }
      }
      tr.cars.forEach((car, k) => car.position.set(tr.x - tr.dir * (k + 0.5) * TRAIN_CAR_LEN, 0.02, tr.y));
    }
    this.trains = this.trains.filter((tr) => {
      const span = TRAIN_CARS * TRAIN_CAR_LEN + 2;
      const out = tr.dir > 0 ? tr.x > this.grid.width + span : tr.x < -span;
      if (out) tr.cars.forEach((c) => c.removeFromParent());
      return !out;
    });
  }
}

const SMOKE_GEOMETRY = new THREE.SphereGeometry(0.06, 6, 5);

/** Caddie transformé en brasero, avec épis de maïs sur la grille. */
function cornCart(): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e2f33, roughness: 0.7 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // Panier du caddie (grillage = parois fines) et roues.
  for (const [w, d, x, z] of [[0.36, 0.02, 0, 0.12], [0.36, 0.02, 0, -0.12], [0.02, 0.24, 0.18, 0], [0.02, 0.24, -0.18, 0]] as const) {
    add(new THREE.BoxGeometry(w, 0.2, d), metal, x, 0.32, z);
  }
  add(new THREE.BoxGeometry(0.36, 0.02, 0.24), metal, 0, 0.22, 0);
  for (const [x, z] of [[0.15, 0.1], [0.15, -0.1], [-0.15, 0.1], [-0.15, -0.1]] as const) {
    add(new THREE.BoxGeometry(0.02, 0.2, 0.02), metal, x, 0.11, z);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateX(Math.PI / 2), dark, x, 0.03, z);
  }
  add(new THREE.BoxGeometry(0.02, 0.02, 0.26), metal, -0.24, 0.48, 0); // poignée
  // Brasero (demi-bidon) et braises.
  add(new THREE.CylinderGeometry(0.13, 0.11, 0.12, 12), dark, 0, 0.47, 0);
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 0.8 }), 0, 0.53, 0);
  // Épis de maïs grillés.
  const corn = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  const husk = new THREE.MeshStandardMaterial({ color: 0xc9b06b });
  for (const z of [-0.06, -0.02, 0.02, 0.06]) {
    const cob = add(new THREE.CapsuleGeometry(0.018, 0.12, 3, 6).rotateZ(Math.PI / 2), corn, 0, 0.56, z);
    cob.rotation.y = z * 2;
    add(new THREE.ConeGeometry(0.015, 0.05, 5).rotateZ(-Math.PI / 2), husk, 0.1, 0.56, z);
  }
  return g;
}

function findYards(grid: MapGrid): TilePoint[][] {
  const seen = new Set<string>();
  const yards: TilePoint[][] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.tileAt(x, y) !== TILE.yard || seen.has(`${x},${y}`)) continue;
      const yard: TilePoint[] = [];
      const stack: TilePoint[] = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length > 0) {
        const p = stack.pop()!;
        yard.push(p);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = { x: p.x + dx, y: p.y + dy };
          if (grid.tileAt(n.x, n.y) === TILE.yard && !seen.has(`${n.x},${n.y}`)) {
            seen.add(`${n.x},${n.y}`);
            stack.push(n);
          }
        }
      }
      yards.push(yard);
    }
  }
  return yards;
}
