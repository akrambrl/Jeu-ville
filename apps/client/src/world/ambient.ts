/**
 * Vie de quartier décorative : tram T1, RER, enfants dans les cours d'école.
 * Rien de tout cela n'est de l'état de jeu (les transports deviendront
 * exploitables en phase 7).
 */
import * as THREE from 'three';
import { TILE, type MapGrid, type TilePoint, type Transit } from '@jeu-ville/shared';
import { Character3D } from './characters.js';

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
