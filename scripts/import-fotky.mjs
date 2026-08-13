/**
 * Nakopiruje fotky rostlin do public/fotky a napari je na databazi podle latinskeho nazvu.
 *
 *   node scripts/import-fotky.mjs "C:\\cesta\\ke\\stazenym\\fotkam"
 *
 * Slozku ROSTLINY z Google Drive staci stahnout jako ZIP, rozbalit a ukazat sem -
 * podslozky (TRVALKY, KERE, STROMY, CIBULOVINY) se prochazeji taky.
 * Nespárované soubory i rostliny bez fotky se vypisou na konci.
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nactiRostliny } from './build-db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zdroj = process.argv[2];

if (!zdroj || !existsSync(zdroj)) {
  console.error('Pouziti: node scripts/import-fotky.mjs "<slozka s fotkami>"');
  process.exit(1);
}

const OBRAZKY = /\.(jpe?g|png|webp|avif)$/i;

function projdi(dir) {
  const out = [];
  for (const jm of readdirSync(dir)) {
    const cesta = join(dir, jm);
    if (statSync(cesta).isDirectory()) out.push(...projdi(cesta));
    else if (OBRAZKY.test(jm)) out.push(cesta);
  }
  return out;
}

const norm = (s) => s.toLowerCase().replace(/['`´"]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s\d+$/, '').trim();

const soubory = projdi(zdroj);
const rostliny = nactiRostliny();
const cil = join(root, 'public', 'fotky');
mkdirSync(cil, { recursive: true });

const pouzite = new Set();
let ok = 0;
const bezFotky = [];

for (const r of rostliny) {
  const hledany = norm(r.latin);
  const rod = hledany.split(' ').slice(0, 2).join(' ');
  const kandidat =
    soubory.find((f) => norm(basename(f, extname(f))) === hledany) ??
    soubory.find((f) => norm(basename(f, extname(f))).startsWith(hledany)) ??
    soubory.find((f) => norm(basename(f, extname(f))) === rod) ??
    soubory.find((f) => norm(basename(f, extname(f))).startsWith(rod));
  if (!kandidat) { bezFotky.push(`${r.kod}  ${r.latin}`); continue; }
  const jmeno = r.latin.replace(/['"]/g, '').replace(/[^A-Za-z0-9]+/g, '-') + extname(kandidat).toLowerCase();
  copyFileSync(kandidat, join(cil, jmeno));
  pouzite.add(kandidat);
  ok++;
}

const nepouzite = soubory.filter((f) => !pouzite.has(f));

console.log(`\nZkopirovano ${ok} z ${rostliny.length} rostlin do public/fotky`);
if (bezFotky.length) {
  console.log(`\nBez fotky (${bezFotky.length}):`);
  for (const x of bezFotky) console.log('  ' + x);
}
if (nepouzite.length) {
  console.log(`\nFotky, ke kterym se nenasla rostlina (${nepouzite.length}):`);
  for (const f of nepouzite) console.log('  ' + basename(f));
}
console.log('\nTeď spust: npm run db');
