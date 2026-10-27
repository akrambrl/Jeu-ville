/**
 * Chargement des modèles 3D (Kenney, CC0). Les fichiers sont importés par Vite,
 * ce qui permet aussi de les embarquer dans la démo autonome (data URI).
 * Chaque pack a sa propre palette `colormap.png`, référencée en relatif dans les
 * GLB : on la redirige vers l'URL du bon fichier.
 *
 * Aucune requête réseau (`fetch`) n'est faite pour les fichiers embarqués : la démo
 * publiée tourne dans un cadre qui les interdit. Les GLB en data URI sont décodés
 * sur place, et les textures sont chargées comme de simples images.
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
    // Textures via <img> (TextureLoader) plutôt que fetch (ImageBitmapLoader).
    loader.register((parser) => {
      (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(manager);
      return { name: 'jeu-ville-image-textures' };
    });
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
    const loader = loaderFor(pack);
    p = url.startsWith('data:') ? loader.parseAsync(decodeDataUri(url), '') : loader.loadAsync(url);
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

/** Data URI base64 → octets, sans passer par fetch. */
function decodeDataUri(uri: string): ArrayBuffer {
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
