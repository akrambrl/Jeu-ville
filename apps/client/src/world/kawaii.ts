/**
 * Style « kawaii » de la ville : ombrage en aplats (toon, 3 paliers) au lieu
 * du rendu réaliste, et couleurs pastel. Les matériaux réalistes sont
 * remplacés une fois, après la construction de la ville.
 */
import * as THREE from 'three';
import { retargetGlow } from './night.js';

/** Paliers de lumière du rendu toon (ombre, mi-teinte, lumière), 0 à 255. */
const TOON_STEPS = [110, 190, 255];

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

/** Version pastel d'une couleur CSS (#rrggbb) : mélangée avec du blanc. */
export function pastel(hex: string, amount = 0.35): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount);
  return `#${c.getHexString()}`;
}
