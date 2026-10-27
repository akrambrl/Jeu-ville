/**
 * Chargement des modèles 3D (Kenney, CC0). Les fichiers sont importés par Vite,
 * ce qui permet aussi de les embarquer dans la démo autonome (data URI).
 * Chaque pack a sa propre palette `colormap.png`, référencée en relatif dans les
 * GLB : on la redirige vers l'URL du bon fichier.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const modelUrls = import.meta.glob('../assets/models/**/*.glb', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;
const paletteUrls = import.meta.glob('../assets/models/**/colormap.png', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;

export type Pack = 'houses' | 'characters' | 'cars' | 'nature';

const loaders = new Map<Pack, GLTFLoader>();
function loaderFor(pack: Pack): GLTFLoader {
  let loader = loaders.get(pack);
  if (!loader) {
    const palette = paletteUrls[`../assets/models/${pack}/colormap.png`];
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/colormap\.png$/.test(url) && palette ? palette : url));
    loader = new GLTFLoader(manager);
    loaders.set(pack, loader);
  }
  return loader;
}

const cache = new Map<string, Promise<GLTF>>();

/** Charge (une seule fois) un modèle d'un pack, ex. `load('houses', 'building-type-a')`. */
export function loadModel(pack: Pack, name: string): Promise<GLTF> {
  const key = `${pack}/${name}`;
  let p = cache.get(key);
  if (!p) {
    const url = modelUrls[`../assets/models/${pack}/${name}.glb`];
    if (!url) throw new Error(`Modèle introuvable : ${key}`);
    p = loaderFor(pack).loadAsync(url);
    cache.set(key, p);
  }
  return p;
}

export function modelNames(pack: Pack): string[] {
  const prefix = `../assets/models/${pack}/`;
  return Object.keys(modelUrls)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length, -'.glb'.length))
    .sort();
}

/** Copie d'un modèle (avec squelette pour les persos animés). */
export function cloneModel(gltf: GLTF): THREE.Object3D {
  return SkeletonUtils.clone(gltf.scene);
}

export function enableShadows(object: THREE.Object3D, cast = true, receive = true): void {
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
