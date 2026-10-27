// Assemble la démo en une page HTML autonome (JS et CSS en ligne).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist-demo/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = await readdir(assets);
const read = (ext) => Promise.all(files.filter((f) => f.endsWith(ext)).map((f) => readFile(join(assets, f), 'utf8')));
const js = (await read('.js')).join('\n').replaceAll('</script', '<\\/script');
const css = (await read('.css')).join('\n');

const page = `<title>Jeu de ville 93</title>
<meta name="theme-color" content="#1c7868">
<style>${css}</style>
<div id="game"></div>
<div id="ui"></div>
<script type="module">${js}</script>
`;
await writeFile(join(dist, 'jeu-ville-93.html'), page);
console.log(`dist-demo/jeu-ville-93.html : ${(page.length / 1024).toFixed(0)} Ko`);
