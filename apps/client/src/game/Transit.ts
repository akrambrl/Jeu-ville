/**
 * Tram et RER animés. Purement visuel pour l'instant : les transports deviendront
 * exploitables par les joueurs en phase 7.
 */
import Phaser from 'phaser';
import type { TilePoint, Transit } from '@jeu-ville/shared';
import { boxColors, drawBox, makeCanvas, project, shade, tileToScreen } from '../render/iso.js';

const TRAM_SPEED = 2.2; // cases / s
const TRAM_DWELL_MS = 4000;
const TRAM_CAR_LENGTH = 1.1; // cases
const TRAM_CARS = 3;

const TRAIN_SPEED = 6;
const TRAIN_STATION_SPEED = 2;
const TRAIN_DWELL_MS = 3500;
const TRAIN_CARS = 5;
const TRAIN_CAR_LENGTH = 1.6;
const TRAIN_GAP_MS: [number, number] = [6000, 22000];

type Axis = 'x' | 'y';

/** Texture d'une voiture vue en iso, orientée selon l'axe x ou y. */
function vehicleTexture(
  scene: Phaser.Scene,
  key: string,
  axis: Axis,
  length: number,
  width: number,
  height: number,
  body: number,
  band: number,
  doubleDeck: boolean,
): string {
  if (scene.textures.exists(key)) return key;
  const W = 120;
  const H = 90;
  const { canvas, ctx } = makeCanvas(W, H);
  const ox = W / 2;
  const oy = H - 30;
  const L = (length * 32) / 2;
  const Wd = width / 2;
  const b =
    axis === 'x'
      ? { x0: -L, y0: -Wd, x1: L, y1: Wd }
      : { x0: -Wd, y0: -L, x1: Wd, y1: L };
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(ox, oy, L * 0.9, L * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  drawBox(ctx, ox, oy, { ...b, z0: 2, z1: height }, boxColors(body));
  // Bande de couleur et fenêtres sur les deux faces visibles.
  const face = (along: 'x' | 'y', z0: number, z1: number, fill: string) => {
    const pts: [number, number][] =
      along === 'x'
        ? [project(ox, oy, b.x0 + 2, b.y1, z0), project(ox, oy, b.x1 - 2, b.y1, z0), project(ox, oy, b.x1 - 2, b.y1, z1), project(ox, oy, b.x0 + 2, b.y1, z1)]
        : [project(ox, oy, b.x1, b.y0 + 2, z0), project(ox, oy, b.x1, b.y1 - 2, z0), project(ox, oy, b.x1, b.y1 - 2, z1), project(ox, oy, b.x1, b.y0 + 2, z1)];
    ctx.beginPath();
    ctx.moveTo(...pts[0]!);
    for (const pt of pts.slice(1)) ctx.lineTo(...pt);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const sideAxis: 'x' | 'y' = axis === 'x' ? 'x' : 'y';
  const endAxis: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
  face(sideAxis, 3, 5, shade(band, 1));
  face(sideAxis, 6, height - 3, '#2c3b4d');
  if (doubleDeck) face(sideAxis, height / 2 - 0.5, height / 2 + 0.8, shade(body, 0.9));
  face(endAxis, 6, height - 3, '#2c3b4d');
  face(endAxis, 3, 5, shade(band, 1));
  // Toit et pantographe.
  drawBox(ctx, ox, oy, { x0: -3, y0: -3, z0: height, x1: 3, y1: 3, z1: height + 2 }, boxColors(0x8d939c));
  scene.textures.addCanvas(key, canvas);
  return key;
}

interface Car {
  sprite: Phaser.GameObjects.Image;
  axis: Axis | null;
}

export class TransitLayer {
  private tram: {
    cars: Car[];
    path: TilePoint[];
    cumulative: number[];
    length: number;
    pos: number;
    dir: 1 | -1;
    stops: number[];
    dwellUntil: number;
    nextStop: number | null;
  } | null = null;

  private trains: { cars: Car[]; track: number; x: number; dir: 1 | -1; stopped: boolean; dwellUntil: number }[] = [];
  private nextTrainAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly transit: Transit,
    private readonly mapWidth: number,
  ) {
    const t = transit.tram;
    if (t && t.path.length >= 2) {
      const cumulative = [0];
      for (let k = 1; k < t.path.length; k++) {
        cumulative.push(cumulative[k - 1]! + Math.hypot(t.path[k]!.x - t.path[k - 1]!.x, t.path[k]!.y - t.path[k - 1]!.y));
      }
      const length = cumulative.at(-1)!;
      this.tram = {
        cars: Array.from({ length: TRAM_CARS }, () => this.makeCar()),
        path: t.path,
        cumulative,
        length,
        pos: 0,
        dir: 1,
        stops: [0, ...t.stops.map((s) => s.at), length],
        dwellUntil: 0,
        nextStop: null,
      };
    }
  }

  private makeCar(): Car {
    return { sprite: this.scene.add.image(0, 0, '__WHITE').setVisible(false).setScale(1), axis: null };
  }

  /** Point et axe du tracé de tram à une distance donnée. */
  private tramPoint(d: number): { x: number; y: number; axis: Axis } {
    const t = this.tram!;
    const pos = Phaser.Math.Clamp(d, 0, t.length);
    let k = 0;
    while (k < t.path.length - 2 && t.cumulative[k + 1]! < pos) k++;
    const a = t.path[k]!;
    const b = t.path[k + 1]!;
    const seg = t.cumulative[k + 1]! - t.cumulative[k]! || 1;
    const u = (pos - t.cumulative[k]!) / seg;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, axis: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'x' : 'y' };
  }

  private placeCar(car: Car, x: number, y: number, axis: Axis, kind: 'tram' | 'train'): void {
    if (car.axis !== axis) {
      car.axis = axis;
      const key =
        kind === 'tram'
          ? vehicleTexture(this.scene, `tram-${axis}`, axis, TRAM_CAR_LENGTH, 18, 17, 0xf4f5f2, 0x2f6fb5, false)
          : vehicleTexture(this.scene, `rer-${axis}`, axis, TRAIN_CAR_LENGTH, 20, 24, 0xeef0f2, 0x1d4f9c, true);
      car.sprite.setTexture(key).setOrigin(0.5, 60 / 90).setVisible(true);
    }
    const p = tileToScreen(x, y);
    car.sprite.setPosition(p.x, p.y).setDepth(x + y + 0.45);
  }

  update(time: number, delta: number): void {
    this.updateTram(time, delta);
    this.updateTrains(time, delta);
  }

  private updateTram(time: number, delta: number): void {
    const t = this.tram;
    if (!t) return;
    if (time >= t.dwellUntil) {
      const before = t.pos;
      t.pos += t.dir * TRAM_SPEED * (delta / 1000);
      // Arrêt à la prochaine station sur le trajet (terminus compris).
      const passed = t.stops.find((s) => (t.dir > 0 ? before < s && t.pos >= s : before > s && t.pos <= s));
      if (passed !== undefined) {
        t.pos = passed;
        t.dwellUntil = time + TRAM_DWELL_MS;
        if (passed <= 0 || passed >= t.length) t.dir = t.dir > 0 ? -1 : 1;
      }
    }
    // Les voitures suivent la tête, côté opposé au sens de marche.
    t.cars.forEach((car, k) => {
      const head = Phaser.Math.Clamp(t.pos, (TRAM_CARS - 1) * TRAM_CAR_LENGTH, t.length);
      const d = head - k * TRAM_CAR_LENGTH;
      const pt = this.tramPoint(d);
      this.placeCar(car, pt.x, pt.y, pt.axis, 'tram');
    });
  }

  private updateTrains(time: number, delta: number): void {
    const rail = this.transit.rail;
    if (!rail || rail.tracks.length === 0) return;
    if (time >= this.nextTrainAt) {
      this.nextTrainAt = time + Phaser.Math.Between(...TRAIN_GAP_MS);
      const index = Phaser.Math.Between(0, rail.tracks.length - 1);
      const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;
      const startX = dir > 0 ? -TRAIN_CARS * TRAIN_CAR_LENGTH : this.mapWidth + TRAIN_CARS * TRAIN_CAR_LENGTH;
      this.trains.push({
        cars: Array.from({ length: TRAIN_CARS }, () => this.makeCar()),
        track: rail.tracks[index]!,
        x: startX,
        dir,
        stopped: false,
        dwellUntil: 0,
      });
    }
    for (const train of this.trains) {
      if (time >= train.dwellUntil) {
        const station = rail.stationX;
        const near = station !== null && Math.abs(train.x - station) < 12 && !train.stopped;
        const before = train.x;
        train.x += train.dir * (near ? TRAIN_STATION_SPEED : TRAIN_SPEED) * (delta / 1000);
        if (station !== null && !train.stopped && (before - station) * (train.x - station) <= 0) {
          // Arrêt en gare.
          train.stopped = true;
          train.dwellUntil = time + TRAIN_DWELL_MS;
        }
      }
      train.cars.forEach((car, k) => this.placeCar(car, train.x - train.dir * k * TRAIN_CAR_LENGTH, train.track, 'x', 'train'));
    }
    // Trains sortis de la carte.
    this.trains = this.trains.filter((train) => {
      const out = train.dir > 0 ? train.x > this.mapWidth + 2 + TRAIN_CARS * TRAIN_CAR_LENGTH : train.x < -2 - TRAIN_CARS * TRAIN_CAR_LENGTH;
      if (out) train.cars.forEach((c) => c.sprite.destroy());
      return !out;
    });
  }
}
