/** Véhicules décoratifs (tram, RER, bus) : maquettes simples et suivi d'un tracé. */
import * as THREE from 'three';
import type { TilePoint } from '@jeu-ville/shared';

export function carMesh(length: number, width: number, height: number, body: number, band: number, doubleDeck: boolean): THREE.Group {
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

/**
 * Parcours aller-retour d'un tracé avec arrêts : avance, marque l'arrêt le temps
 * de `dwell` secondes, fait demi-tour aux terminus.
 */
export class PathRunner {
  readonly cum: number[] = [0];
  readonly length: number;
  /** Arrêts (distance le long du tracé), terminus compris. */
  readonly stops: number[];
  pos: number;
  dir: 1 | -1;
  private wait = 0;

  constructor(
    readonly path: TilePoint[],
    stops: number[],
    private readonly speed: number,
    private readonly dwell: number,
    start = 0,
    dir: 1 | -1 = 1,
  ) {
    for (let k = 1; k < path.length; k++) this.cum.push(this.cum[k - 1]! + Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y));
    this.length = this.cum.at(-1)!;
    this.stops = [0, ...stops, this.length];
    this.pos = start;
    this.dir = dir;
  }

  get stopped(): boolean {
    return this.wait > 0;
  }

  /** Avance de `dt` secondes ; renvoie la distance de l'arrêt atteint, ou null. */
  update(dt: number): number | null {
    if (this.wait > 0) {
      this.wait -= dt;
      return null;
    }
    const before = this.pos;
    this.pos += this.dir * this.speed * dt;
    const passed = this.stops.find((s) => (this.dir > 0 ? before < s && this.pos >= s : before > s && this.pos <= s));
    if (passed === undefined) return null;
    this.pos = passed;
    this.wait = this.dwell;
    if (passed <= 0 || passed >= this.length) this.dir = this.dir > 0 ? -1 : 1;
    return passed;
  }

  /** Point du tracé à la distance `d`, avec l'angle du tronçon. */
  pointAt(d: number): { x: number; y: number; angle: number } {
    const pos = THREE.MathUtils.clamp(d, 0, this.length);
    let k = 0;
    while (k < this.path.length - 2 && this.cum[k + 1]! < pos) k++;
    const a = this.path[k]!;
    const b = this.path[k + 1]!;
    const u = (pos - this.cum[k]!) / (this.cum[k + 1]! - this.cum[k]! || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
}
