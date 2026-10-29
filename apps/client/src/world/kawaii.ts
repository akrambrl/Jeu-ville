/**
 * Monde « jouet » coloré : ombrage en aplats (toon, 3 paliers doux) au lieu
 * du rendu réaliste, couleurs vives. Les matériaux réalistes sont remplacés
 * une fois, après la construction de la ville.
 */
import * as THREE from 'three';
import { retargetGlow } from './night.js';

/** Paliers de lumière du rendu toon (ombre, mi-teinte, lumière), 0 à 255. */
const TOON_STEPS = [150, 215, 255];

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array(TOON_STEPS), TOON_STEPS.length, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const converted = new Map<THREE.Material, THREE.Material>();

function toon(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m;
  let t = converted.get(m);
  if (!t) {
    const mat = new THREE.MeshToonMaterial({
      name: m.name,
      color: m.color,
      map: m.map,
      emissive: m.emissive,
      emissiveMap: m.emissiveMap,
      emissiveIntensity: m.emissiveIntensity,
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      side: m.side,
      depthWrite: m.depthWrite,
      vertexColors: m.vertexColors,
      gradientMap: gradientMap(),
    });
    // Ce qui s'allumait la nuit continue de s'allumer.
    retargetGlow(m, mat);
    converted.set(m, mat);
    t = mat;
  }
  return t;
}

/** Passe tous les maillages de `root` en rendu toon. */
export function toonify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toon) : toon(mesh.material);
  });
}

/** Version « jouet » d'une couleur CSS (#rrggbb) : plus saturée et plus claire. */
export function vivid(hex: string): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.1), Math.min(0.72, Math.max(0.45, hsl.l + 0.12)));
  return `#${c.getHexString()}`;
}
