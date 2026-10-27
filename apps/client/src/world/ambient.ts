/**
 * Vie de quartier décorative : tram T1, RER, bus, voyageurs, enfants dans les
 * cours d'école, marchands ambulants. Rien de tout cela n'est de l'état de jeu
 * (les transports deviendront exploitables en phase 7) ; seul l'achat chez un
 * marchand passe par le serveur.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DECOR, TILE, type DistrictMap, type MapGrid, type StreetVendor, type TilePoint } from '@jeu-ville/shared';
import { Character3D } from './characters.js';
import { groundTop } from './ground.js';
import { TransitRiders, type RiderStop } from './riders.js';
import { signTexture } from './textures.js';
import { PathRunner, carMesh } from './vehicles.js';

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
const BUS_SPEED = 2.2;
const BUS_DWELL = 3;
const BUS_LEN = 1.3;
/** Un bus de plus par tranche de cette longueur de ligne (cases). */
const BUS_SPACING = 45;
/** Côté droit de la chaussée (décalage depuis l'axe, en cases). */
const LANE_OFFSET = 0.5;
const KIDS_PER_YARD = 5;
/** Les enfants d'une cour n'apparaissent que si la caméra regarde à moins de cette distance. */
const KIDS_ACTIVE_RADIUS = 26;
const KIDS_RELEASE_RADIUS = 34;
const VENDOR_CALL_EVERY: [number, number] = [5, 11];
const VENDOR_CALL_DURATION = 2.5;
type VendorKind = StreetVendor['kind'];

interface Yard {
  tiles: TilePoint[];
  center: TilePoint;
  kids: { c: Character3D; target: TilePoint; wait: number; run: boolean }[];
}

export class Ambient {
  readonly group = new THREE.Group();
  private tram: { runner: PathRunner; cars: THREE.Group[]; stopNames: Map<number, string> } | null = null;
  private trains: { cars: THREE.Group[]; y: number; x: number; dir: 1 | -1; stopped: boolean; dwell: number }[] = [];
  private nextTrain = 2;
  private buses: { runner: PathRunner; mesh: THREE.Group; stopNames: Map<number, string> }[] = [];
  private readonly yards: Yard[];
  private readonly riders: TransitRiders;
  /** Quai voyageurs (ordonnée) le plus proche de chaque voie desservie. */
  private readonly platformOf = new Map<number, number>();
  private vendors: { c: Character3D; bubble: CSS2DObject; nextCall: number; calling: number }[] = [];
  private smoke: { mesh: THREE.Mesh; base: THREE.Vector3; t: number }[] = [];

  constructor(
    private readonly grid: MapGrid,
    map: DistrictMap,
  ) {
    const transit = map.transit;
    const riderStops: RiderStop[] = [];

    const t = transit.tram;
    if (t && t.path.length >= 2) {
      const cars = Array.from({ length: TRAM_CARS }, () => carMesh(TRAM_CAR_LEN * 0.96, 0.55, 0.55, 0xf4f5f2, 0x2f6fb5, false));
      cars.forEach((c) => this.group.add(c));
      const runner = new PathRunner(t.path, t.stops.map((s) => s.at), TRAM_SPEED, TRAM_DWELL, TRAM_CARS * TRAM_CAR_LEN);
      this.tram = { runner, cars, stopNames: new Map(t.stops.map((s) => [s.at, s.name])) };
      for (const s of t.stops) {
        const p = runner.pointAt(s.at);
        riderStops.push({ id: `tram:${s.name}`, wait: this.shelterNear(p) ?? { x: Math.round(p.x), y: Math.round(p.y) }, axis: 'x', spread: 0.4 });
      }
    }

    for (const line of transit.bus) {
      if (line.path.length < 2) continue;
      const stopNames = new Map(line.stops.map((s) => [s.at, s.name]));
      const total = line.path.reduce((acc, p, k) => (k ? acc + Math.hypot(p.x - line.path[k - 1]!.x, p.y - line.path[k - 1]!.y) : 0), 0);
      const count = 1 + Math.floor(total / BUS_SPACING);
      for (let k = 0; k < count; k++) {
        const runner = new PathRunner(line.path, line.stops.map((s) => s.at), BUS_SPEED, BUS_DWELL, (total * (k + 0.5)) / count, k % 2 ? -1 : 1);
        const mesh = busMesh(line.ref);
        this.group.add(mesh);
        this.buses.push({ runner, mesh, stopNames });
      }
    }
    for (const st of transit.busStops) {
      riderStops.push({ id: `bus:${st.name}`, wait: { x: st.x, y: st.y }, axis: st.curb.x === st.x ? 'x' : 'y', spread: 0.35 });
    }

    const rail = transit.rail;
    if (rail?.stationX != null) {
      // Les quais sont entre les voies 2 et 3, et 4 et 5 (voir schematize).
      const platforms = [rail.tracks[1]! + 1, rail.tracks[3]! + 1];
      for (const y of platforms) {
        riderStops.push({ id: `rail:${y}`, wait: { x: rail.stationX, y }, axis: 'x', spread: 2.5 });
        for (const track of rail.tracks) if (Math.abs(track - y) === 1) this.platformOf.set(track, y);
      }
    }
    this.riders = new TransitRiders(grid, this.group, riderStops);
    this.yards = findYards(grid).map((tiles) => ({
      tiles,
      center: {
        x: tiles.reduce((s, p) => s + p.x, 0) / tiles.length,
        y: tiles.reduce((s, p) => s + p.y, 0) / tiles.length,
      },
      kids: [],
    }));
  }

  /** Abri de tram le plus proche d'un point de la voie. */
  private shelterNear(p: { x: number; y: number }): TilePoint | null {
    let best: TilePoint | null = null;
    for (let y = Math.round(p.y) - 3; y <= Math.round(p.y) + 3; y++) {
      for (let x = Math.round(p.x) - 3; x <= Math.round(p.x) + 3; x++) {
        if (this.grid.decorAt(x, y) !== DECOR.shelter) continue;
        if (!best || Math.hypot(x - p.x, y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = { x, y };
      }
    }
    return best;
  }

  /** Marchands ambulants (maïs chaud, marrons chauds) placés par la carte. */
  async spawnVendors(vendors: StreetVendor[]): Promise<void> {
    for (const v of vendors) await this.addVendor(v.kind, { x: v.x, y: v.y }, v.facing);
  }

  private async addVendor(kind: VendorKind, spot: TilePoint, lookAt: TilePoint): Promise<void> {
    const style = VENDOR_STYLES[kind];
    const top = groundTop(this.grid.tileAt(spot.x, spot.y));
    // Le vendeur, à côté de son caddie, tourné vers le passage.
    const vendor = new Character3D((x, y) => this.grid.tileAt(x, y), spot.x - 0.25, spot.y);
    await vendor.load(style.models[this.vendors.length % style.models.length]!);
    const angle = Math.atan2(lookAt.x - spot.x, lookAt.y - spot.y);
    vendor.root.rotation.y = angle;
    vendor.setTarget(spot.x - 0.25, spot.y, false);
    this.group.add(vendor.root);

    const cart = style.cart();
    cart.position.set(spot.x + 0.22, top, spot.y + 0.05);
    cart.rotation.y = angle;
    this.group.add(cart);
    // Fumée du brasero (ou de la cheminée).
    const smokeFrom = style.smoke.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(SMOKE_GEOMETRY, new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0, depthWrite: false }));
      const base = new THREE.Vector3(spot.x + 0.22, top, spot.y + 0.05).add(smokeFrom);
      this.group.add(puff);
      this.smoke.push({ mesh: puff, base, t: k / 4 });
    }
    // Bulle « Maïs chaud ! » / « Chauds les marrons ! ».
    const el = document.createElement('div');
    el.className = 'speech';
    el.textContent = style.cry;
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

  /** `focus` : point regardé par la caméra (les figurants n'existent qu'autour). */
  update(dt: number, focus: TilePoint): void {
    this.updateTram(dt);
    this.updateTrains(dt);
    this.updateBuses(dt);
    this.updateVendors(dt);
    this.riders.update(dt, focus);
    this.updateKids(dt, focus);
  }

  private updateKids(dt: number, focus: TilePoint): void {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const yard of this.yards) {
      const d = Math.hypot(yard.center.x - focus.x, yard.center.y - focus.y);
      if (yard.kids.length === 0 && d < KIDS_ACTIVE_RADIUS) {
        for (let k = 0; k < Math.min(KIDS_PER_YARD, yard.tiles.length); k++) {
          const start = yard.tiles[Math.floor(Math.random() * yard.tiles.length)]!;
          const c = new Character3D((x, y) => this.grid.tileAt(x, y), start.x, start.y, 0.5);
          void c.load(`character-${k % 2 ? 'female' : 'male'}-${letters[Math.floor(Math.random() * 6)]}`);
          this.group.add(c.root);
          yard.kids.push({ c, target: start, wait: Math.random() * 2, run: false });
        }
      } else if (yard.kids.length > 0 && d > KIDS_RELEASE_RADIUS) {
        for (const kid of yard.kids) kid.c.dispose();
        yard.kids = [];
      }
      for (const kid of yard.kids) {
        const dx = kid.target.x - kid.c.tileX;
        const dy = kid.target.y - kid.c.tileY;
        const dist = Math.hypot(dx, dy);
        if (kid.wait > 0) {
          kid.wait -= dt;
          kid.c.setTarget(kid.c.tileX, kid.c.tileY, false);
        } else if (dist < 0.08) {
          kid.target = yard.tiles[Math.floor(Math.random() * yard.tiles.length)]!;
          kid.run = Math.random() < 0.6;
          kid.wait = 0.3 + Math.random() * 2;
        } else {
          const step = Math.min(dist, (kid.run ? 2.2 : 1) * dt);
          kid.c.setTarget(kid.c.tileX + (dx / dist) * step, kid.c.tileY + (dy / dist) * step, true);
        }
        kid.c.update(dt, kid.run ? 'sprint' : 'walk');
      }
    }
  }

  private updateTram(dt: number): void {
    const t = this.tram;
    if (!t) return;
    const at = t.runner.update(dt);
    if (at !== null) {
      const name = t.stopNames.get(at);
      const p = t.runner.pointAt(at - t.runner.dir * TRAM_CAR_LEN);
      if (name) this.riders.vehicleArrived(`tram:${name}`, p);
    }
    const head = THREE.MathUtils.clamp(t.runner.pos, (TRAM_CARS - 1) * TRAM_CAR_LEN, t.runner.length);
    t.cars.forEach((car, k) => {
      const p = t.runner.pointAt(head - k * TRAM_CAR_LEN - TRAM_CAR_LEN / 2);
      car.position.set(p.x, 0, p.y);
      car.rotation.y = -p.angle;
    });
  }

  private updateBuses(dt: number): void {
    for (const b of this.buses) {
      const at = b.runner.update(dt);
      const p = b.runner.pointAt(b.runner.pos);
      // Conduite à droite : décalage perpendiculaire au sens de marche.
      const angle = b.runner.dir > 0 ? p.angle : p.angle + Math.PI;
      const ox = -Math.sin(angle) * LANE_OFFSET;
      const oy = Math.cos(angle) * LANE_OFFSET;
      b.mesh.position.set(p.x + ox, groundTop(this.grid.tileAt(Math.round(p.x), Math.round(p.y))), p.y + oy);
      b.mesh.rotation.y = -angle;
      if (at !== null) {
        const name = b.stopNames.get(at);
        if (name) this.riders.vehicleArrived(`bus:${name}`, { x: p.x + ox * 1.6, y: p.y + oy * 1.6 });
      }
    }
  }

  private updateTrains(dt: number): void {
    const rail = this.grid.map.transit.rail;
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
          const platform = this.platformOf.get(tr.y);
          if (platform !== undefined) this.riders.vehicleArrived(`rail:${platform}`, { x: station - tr.dir * 2, y: tr.y });
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

/** Bus articulé blanc à bandeau vert, numéro de ligne sur les flancs et à l'avant. */
function busMesh(ref: string): THREE.Group {
  const g = carMesh(BUS_LEN, 0.5, 0.55, 0xf2f4f3, 0x2aa58a, false);
  const tex = signTexture(ref, '#1d2a33', '#ffd84d');
  const plate = new THREE.MeshBasicMaterial({ map: tex });
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), plate);
    m.position.set(BUS_LEN * 0.28, 0.5, side * 0.256);
    if (side < 0) m.rotation.y = Math.PI;
    g.add(m);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), plate);
  front.position.set(BUS_LEN / 2 + 0.006, 0.55, 0);
  front.rotation.y = Math.PI / 2;
  g.add(front);
  return g;
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

/** Brasero à marrons : bidon-poêle sur charrette à bras, poêle percée, cheminée et cornets en papier. */
function chestnutCart(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x26272b, metalness: 0.5, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // Charrette : plateau en bois, deux grandes roues, poignées courtes.
  add(new THREE.BoxGeometry(0.4, 0.03, 0.28), wood, 0, 0.16, 0);
  for (const z of [0.16, -0.16]) {
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 14).rotateX(Math.PI / 2), iron, 0.05, 0.12, z);
    add(new THREE.BoxGeometry(0.12, 0.02, 0.02), wood, -0.25, 0.16, z * 0.8);
  }
  add(new THREE.BoxGeometry(0.02, 0.16, 0.02), wood, 0.18, 0.08, 0); // béquille
  // Poêle : bidon, foyer rougeoyant, poêle percée garnie de marrons.
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 14), iron, 0.04, 0.3, 0);
  add(new THREE.BoxGeometry(0.07, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 0.9 }), 0.04, 0.24, 0.121);
  add(new THREE.CylinderGeometry(0.15, 0.13, 0.03, 16), iron, 0.04, 0.445, 0);
  const chestnut = new THREE.MeshStandardMaterial({ color: 0x5a2e14, roughness: 0.5 });
  const nut = new THREE.SphereGeometry(0.022, 6, 5).scale(1, 0.7, 1);
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4;
    const r = 0.03 + (k % 4) * 0.025;
    add(nut, chestnut, 0.04 + Math.cos(a) * r, 0.47, Math.sin(a) * r);
  }
  // Cheminée (la fumée sort d'ici).
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), iron, -0.1, 0.55, -0.08);
  // Cornets en papier journal sur le plateau.
  const paper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
  for (const z of [0.05, 0.1]) add(new THREE.ConeGeometry(0.025, 0.08, 8).rotateX(Math.PI), paper, -0.14, 0.215, z);
  return g;
}

const VENDOR_STYLES: Record<VendorKind, { cry: string; models: string[]; cart: () => THREE.Group; smoke: THREE.Vector3 }> = {
  corn: {
    cry: '🌽 Maïs chaud !',
    models: ['character-male-c', 'character-male-e', 'character-female-d'],
    cart: cornCart,
    smoke: new THREE.Vector3(0, 0.62, 0),
  },
  chestnut: {
    cry: '🌰 Chauds les marrons !',
    models: ['character-male-f', 'character-female-b', 'character-male-a'],
    cart: chestnutCart,
    smoke: new THREE.Vector3(-0.1, 0.74, -0.08),
  },
};

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
