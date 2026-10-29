/** Gros nuages ronds et blancs qui dérivent au-dessus de la ville (monde « jouet »). */
import * as THREE from 'three';
import { seeded } from './textures.js';

const COUNT = 18;
/** Altitude des nuages et vitesse de dérive (cases par seconde). */
const HEIGHT = [7, 10] as const;
const SPEED = 0.35;
const DAY_COLOR = new THREE.Color(0xffffff);
const NIGHT_COLOR = new THREE.Color(0x4a5280);

export class Clouds {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 });

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    const r = seeded(42);
    const puff = new THREE.SphereGeometry(1, 14, 10);
    for (let k = 0; k < COUNT; k++) {
      const cloud = new THREE.Group();
      // 4 à 6 boules, la plus grosse au milieu, aplaties dessous.
      const n = 4 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const s = i === 0 ? 1.4 : 0.8 + r() * 0.5;
        const m = new THREE.Mesh(puff, this.material);
        m.scale.set(s, s * 0.8, s);
        m.position.set((i - n / 2) * 0.9 + r() * 0.4, r() * 0.4, (r() - 0.5) * 1.2);
        cloud.add(m);
      }
      cloud.position.set(r() * width, HEIGHT[0] + r() * (HEIGHT[1] - HEIGHT[0]), r() * height);
      this.group.add(cloud);
    }
  }

  update(dt: number): void {
    for (const c of this.group.children) {
      c.position.x += SPEED * dt;
      if (c.position.x > this.width + 6) c.position.x = -6;
    }
  }

  /** 0 = plein jour, 1 = nuit : les nuages s'assombrissent. */
  setNight(night: number): void {
    this.material.color.copy(DAY_COLOR).lerp(NIGHT_COLOR, night);
    this.material.emissiveIntensity = 0.25 * (1 - night);
  }
}
