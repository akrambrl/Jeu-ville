/**
 * Ce qui s'allume la nuit : fenêtres, vitrines, ampoules des lampadaires,
 * halos au sol. Chaque élément s'enregistre ici ; `applyNight` règle l'intensité.
 */
import * as THREE from 'three';

const glowing: { m: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
const fading: { m: THREE.Material & { opacity: number }; max: number }[] = [];

/** Matériau dont l'émission passe de `day` à `night` à la tombée de la nuit. */
export function glowAtNight(m: THREE.MeshStandardMaterial, night: number, day = 0): void {
  glowing.push({ m, day, night });
  m.emissiveIntensity = day;
}

/** Matériau transparent qui n'apparaît que la nuit (halos), jusqu'à l'opacité `max`. */
export function showAtNight(m: THREE.Material & { opacity: number }, max: number): void {
  fading.push({ m, max });
  m.opacity = 0;
}

/** `night` : 0 = plein jour, 1 = nuit noire. */
export function applyNight(night: number): void {
  for (const g of glowing) g.m.emissiveIntensity = THREE.MathUtils.lerp(g.day, g.night, night);
  for (const f of fading) {
    f.m.opacity = f.max * night;
    f.m.visible = night > 0.01;
  }
}

/** Fenêtres éclairées au hasard (≈ 1 sur 2) sur une façade : 4×4 travées, à répéter. */
export function litWindowsTexture(wide: boolean, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const spots: [number, number][] = wide ? [[6, 52]] : [[8, 20], [36, 20]];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      for (const [x, w] of spots) {
        if (rand() > 0.5) continue;
        ctx.fillStyle = rand() < 0.7 ? '#ffcf73' : '#ffe9b8';
        // Même placement que les vitres de facadeTexture (cases de 64 px).
        ctx.fillRect(cx * 64 + x, (3 - cy) * 64 + 16, w, 32);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.25, 0.25);
  return tex;
}

/** Vitrine allumée (zone vitrée + enseigne) pour un rez-de-chaussée commerçant de 128 px. */
export function litStorefrontTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffe2a8';
  ctx.fillRect(10, 56, 108, 66);
  ctx.fillStyle = '#7a6a50';
  ctx.fillRect(4, 6, 120, 30);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
