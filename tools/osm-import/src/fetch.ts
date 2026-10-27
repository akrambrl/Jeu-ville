/** Télécharge les données OSM brutes de chaque quartier (API OSM 0.6). */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISTRICTS, osmFileName } from './districts.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

await mkdir(dataDir, { recursive: true });
for (const d of DISTRICTS) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${d.bbox.join(',')}`;
  console.log(`Téléchargement ${d.cityName} / ${d.districtName}…`);
  const res = await fetch(url, { headers: { 'User-Agent': 'jeu-ville-osm-import/0.1' } });
  if (!res.ok) throw new Error(`OSM ${res.status} ${res.statusText}`);
  await writeFile(join(dataDir, osmFileName(d)), await res.text());
}
console.log('OK');
