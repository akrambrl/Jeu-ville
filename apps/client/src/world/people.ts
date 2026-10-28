/**
 * Personnages aux proportions réalistes (Quaternius « Ultimate Modular Men /
 * Women », CC0) : une tenue par fichier, animations partagées par sexe
 * (même squelette), peau et cheveux recolorés selon le perso.
 */
import * as THREE from 'three';
import { BASE_LOOKS, HAIR_COLORS, SKIN_TONES, type CharacterLook } from '@jeu-ville/shared';
import { cloneModel, loadModel } from './assets.js';

export type PersonLook = Pick<CharacterLook, 'sex' | 'baseLook' | 'skinTone' | 'hairColor'>;

/** Matériaux recolorés et facteur appliqué à la couleur choisie (ombres, mèches). */
const SKIN_MATERIALS: Record<string, number> = { Skin: 1, Skin_Darker: 0.82 };
const HAIR_MATERIALS: Record<string, number> = { Hair: 1, Hair_Brown: 1, Hair_Blond: 1.35, Eyebrows: 0.9, Moustache: 1 };

/** Un matériau par (matériau d'origine, couleur), partagé entre les persos identiques. */
const tinted = new Map<string, THREE.MeshStandardMaterial>();

function tint(material: THREE.MeshStandardMaterial, color: number, factor: number): THREE.MeshStandardMaterial {
  const key = `${material.uuid}:${color}:${factor}`;
  let m = tinted.get(key);
  if (!m) {
    m = material.clone();
    m.color.setHex(color).multiplyScalar(factor);
    tinted.set(key, m);
  }
  return m;
}

export interface Person {
  body: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

export async function loadPerson(look: PersonLook): Promise<Person> {
  const sex = look.sex === 'female' ? 'female' : 'male';
  const outfit = (BASE_LOOKS[look.baseLook] ?? BASE_LOOKS[0])[sex];
  const [gltf, anims] = await Promise.all([loadModel('people', outfit.model), loadModel('people', `anims-${sex}`)]);
  const body = cloneModel(gltf);
  const skin = SKIN_TONES[look.skinTone] ?? SKIN_TONES[2];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const recolor = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      const s = SKIN_MATERIALS[std.name];
      if (s !== undefined) return tint(std, skin, s);
      const h = HAIR_MATERIALS[std.name];
      if (h !== undefined) return tint(std, hair, h);
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
  });
  return { body, clips: anims.animations };
}

/** Apparence tirée au hasard (passants, vendeurs, voyageurs…). */
export function randomLook(rand: () => number = Math.random): PersonLook {
  const pick = (n: number) => Math.floor(rand() * n);
  return {
    sex: rand() < 0.5 ? 'male' : 'female',
    baseLook: pick(BASE_LOOKS.length),
    skinTone: pick(SKIN_TONES.length),
    hairColor: pick(HAIR_COLORS.length),
  };
}
