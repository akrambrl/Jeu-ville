/**
 * Prépare les personnages pour le jeu, au format GLB :
 * - un fichier par tenue (`<nom>.glb`) : maillage + squelette, sans animation,
 *   données dédupliquées et quantifiées (KHR_mesh_quantization) ;
 * - un fichier d'animations par sexe (`anims-<sexe>.glb`), partagé par toutes
 *   les tenues (même squelette) : seulement les animations utiles, sans les
 *   pistes constantes égales à la pose de repos.
 * Sortie : apps/client/src/assets/models/people/
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, type Animation, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';
import { ANIMATIONS, SOURCES } from './sources.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const outDir = join(root, '..', '..', 'apps', 'client', 'src', 'assets', 'models', 'people');
await mkdir(outDir, { recursive: true });

/** Écart toléré pour considérer une piste comme constante / égale au repos. */
const EPSILON = 1e-3;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Retire une animation avec ses pistes (sinon leurs données restent dans le
 * fichier). Les accessoires, parfois partagés, sont nettoyés ensuite par prune.
 */
function dropAnimation(anim: Animation): void {
  for (const sampler of anim.listSamplers()) sampler.dispose();
  for (const channel of anim.listChannels()) channel.dispose();
  anim.dispose();
}

async function write(doc: Document, name: string): Promise<void> {
  const glb = await io.writeBinary(doc);
  await io.write(join(outDir, `${name}.glb`), doc);
  console.log(`${name}.glb`, `${Math.round(glb.byteLength / 1024)} Ko`);
}

/** Parties du corps gardées ; le reste (pistolet du costume…) est retiré. */
const BODY_PARTS = /_(Body|Feet|Head|Legs)$/;

/** Tenue : maillage seul. */
for (const s of SOURCES) {
  const doc = await io.read(join(dataDir, `${s.out}.gltf`));
  for (const anim of doc.getRoot().listAnimations()) dropAnimation(anim);
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh() && !BODY_PARTS.test(node.getName())) node.dispose();
  }
  await doc.transform(prune(), dedup(), quantize({ quantizeNormal: 8, quantizeColor: 8 }));
  await write(doc, s.out);
}

/** Animations : prises sur la première tenue de chaque sexe. */
for (const sex of ['male', 'female'] as const) {
  const source = SOURCES.find((s) => s.sex === sex)!;
  const doc = await io.read(join(dataDir, `${source.out}.gltf`));
  const r = doc.getRoot();
  for (const anim of r.listAnimations()) {
    const name = ANIMATIONS[anim.getName()];
    if (!name) {
      dropAnimation(anim);
      continue;
    }
    anim.setName(name);
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode()!;
      const path = channel.getTargetPath()!;
      const out = channel.getSampler()!.getOutput()!.getArray()!;
      const rest =
        path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : path === 'scale' ? node.getScale() : null;
      const n = rest?.length ?? 1;
      const atRest = rest !== null && Array.from(out as ArrayLike<number>).every((v, i) => Math.abs(v - rest[i % n]!) < EPSILON);
      if (atRest) {
        const sampler = channel.getSampler()!;
        channel.dispose();
        sampler.dispose();
      }
    }
  }
  // On ne garde que le squelette : ni maillage ni matériau.
  for (const mesh of r.listMeshes()) mesh.dispose();
  for (const skin of r.listSkins()) skin.dispose();
  await doc.transform(resample({ tolerance: EPSILON }), prune({ keepLeaves: true }), dedup());
  await write(doc, `anims-${sex}`);
}
