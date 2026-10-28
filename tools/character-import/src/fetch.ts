/** Télécharge les personnages glTF d'origine dans data/ (non versionné). */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
await mkdir(dataDir, { recursive: true });
for (const s of SOURCES) {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${s.driveId}`);
  if (!res.ok) throw new Error(`${s.out} : ${res.status} ${res.statusText}`);
  await writeFile(join(dataDir, `${s.out}.gltf`), Buffer.from(await res.arrayBuffer()));
  console.log('OK', s.out);
}
