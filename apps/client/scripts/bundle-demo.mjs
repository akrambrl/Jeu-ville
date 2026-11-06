// Assemble la démo en une page HTML autonome (JS et CSS en ligne).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist-demo/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = await readdir(assets);
const read = (ext) => Promise.all(files.filter((f) => f.endsWith(ext)).map((f) => readFile(join(assets, f), 'utf8')));
const js = (await read('.js')).join('\n').replaceAll('</script', '<\\/script');
const css = (await read('.css')).join('\n');

const page = `<title>Bac Bataille</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#241656">
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet" />
<style>${css}</style>
<div id="ui"></div>
<script type="module">${js}</script>
`;
await writeFile(join(dist, 'bac-bataille.html'), page);
console.log(`dist-demo/bac-bataille.html : ${(page.length / 1024).toFixed(0)} Ko`);
