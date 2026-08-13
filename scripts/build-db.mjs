/**
 * Prevede data/rostliny.tsv na public/data/plants.json.
 * Spousti se pri `npm run build` i rucne: node scripts/build-db.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const KATEGORIE = {
  T: { nazev: 'trvalka', fill: '#e8cfe8', stroke: '#9c62a0', plocha: true },
  G: { nazev: 'travina', fill: '#f6edad', stroke: '#b0a03a', plocha: true },
  F: { nazev: 'kapradina', fill: '#cfe6cf', stroke: '#5b9a5b', plocha: true },
  C: { nazev: 'cibulovina', fill: '#dcdcf2', stroke: '#7b7bc4', plocha: true },
  K: { nazev: 'keř', fill: '#d9edd1', stroke: '#679a57', plocha: false },
  S: { nazev: 'strom', fill: '#bdd9b1', stroke: '#4a7d3c', plocha: false },
  J: { nazev: 'jehličnan', fill: '#cfe2de', stroke: '#5a8d86', plocha: false },
  U: { nazev: 'užitková dřevina', fill: '#f1dcc0', stroke: '#ac7c3c', plocha: false },
};

/** Orientacni spon podle kategorie a vysky, kdyz neni v tabulce vyplnen. */
function odhadniHustotu(kat, vyska) {
  const h = vyska || 0.3;
  if (kat === 'C') return 40;
  if (kat === 'K' || kat === 'S' || kat === 'J' || kat === 'U') {
    if (h >= 8) return 0.08;
    if (h >= 4) return 0.3;
    if (h >= 2) return 0.6;
    if (h >= 1) return 1.2;
    return 2;
  }
  if (kat === 'G') {
    if (h >= 2.5) return 0.7;
    if (h >= 1.5) return 1;
    if (h >= 0.8) return 3;
    if (h >= 0.4) return 5;
    return 9;
  }
  // trvalky a kapradiny
  if (h <= 0.1) return 12;
  if (h <= 0.2) return 9;
  if (h <= 0.3) return 7;
  if (h <= 0.5) return 5;
  if (h <= 0.9) return 4;
  if (h <= 1.5) return 3;
  return 2;
}

function mesice(kvet) {
  if (!kvet || kvet === '-') return [];
  const m = String(kvet).match(/(\d+)\s*-\s*(\d+)/);
  if (m) {
    const a = +m[1], b = +m[2];
    const out = [];
    for (let i = 0, x = a; i < 12; i++) { out.push(x); if (x === b) break; x = x === 12 ? 1 : x + 1; }
    return out;
  }
  const one = String(kvet).match(/\d+/);
  return one ? [+one[0]] : [];
}

const SVETLO = { S: 'slunce', P: 'polostín', N: 'stín' };

export function nactiRostliny() {
  const txt = readFileSync(join(root, 'data', 'rostliny.tsv'), 'utf8');
  const radky = txt.split(/\r?\n/);
  const start = radky.findIndex((r) => r.startsWith('kod\t'));
  if (start < 0) throw new Error('V rostliny.tsv chybi hlavicka zacinajici "kod"');
  const hlavicka = radky[start].split('\t').map((s) => s.trim());
  const plants = [];
  const videne = new Map();

  for (let i = start + 1; i < radky.length; i++) {
    const radek = radky[i];
    if (!radek.trim() || radek.startsWith('#')) continue;
    const bunky = radek.split('\t');
    const r = {};
    hlavicka.forEach((h, j) => (r[h] = (bunky[j] ?? '').trim()));
    if (!r.kod || !r.latin) continue;

    if (videne.has(r.kod)) {
      throw new Error(`Duplicitni kod "${r.kod}": ${videne.get(r.kod)} vs ${r.latin} (radek ${i + 1})`);
    }
    videne.set(r.kod, r.latin);

    const kat = r.kat || 'T';
    if (!KATEGORIE[kat]) throw new Error(`Neznama kategorie "${kat}" u ${r.latin}`);
    const vyska = parseFloat(String(r.vyska).replace(',', '.')) || 0.3;
    const hustota = r.hustota ? parseFloat(String(r.hustota).replace(',', '.')) : odhadniHustotu(kat, vyska);

    plants.push({
      kod: r.kod,
      latin: r.latin,
      cesky: r.cesky,
      kat,
      kategorie: KATEGORIE[kat].nazev,
      svetlo: (r.svetlo || 'S').split('').map((z) => SVETLO[z]).filter(Boolean),
      vyska,
      kvet: r.kvet && r.kvet !== '-' ? r.kvet : '',
      mesice: mesice(r.kvet),
      barva: r.barva || '',
      pozn: r.pozn || '',
      hustota,
      // rozestup v rade (m) - pouziva se u skupin keru
      rozestup: +Math.sqrt(1 / hustota).toFixed(2),
      // prumer koruny (m) - vychozi hodnota pro stromy a solitery
      koruna: +Math.min(8, Math.max(0.5, vyska * 0.35)).toFixed(1),
      foto: '',
    });
  }
  return plants;
}

function doplnFotky(plants) {
  const dir = join(root, 'public', 'fotky');
  if (!existsSync(dir)) return 0;
  const soubory = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
  const norm = (s) => s.toLowerCase().replace(/['`´"]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let n = 0;
  for (const p of plants) {
    const cil = norm(p.latin);
    const rod = cil.split(' ').slice(0, 2).join(' ');
    let nalez = soubory.find((f) => norm(f.replace(/\.[^.]+$/, '')) === cil);
    if (!nalez) nalez = soubory.find((f) => norm(f.replace(/\.[^.]+$/, '')).startsWith(cil));
    if (!nalez) nalez = soubory.find((f) => norm(f.replace(/\.[^.]+$/, '')).startsWith(rod));
    if (nalez) { p.foto = '/fotky/' + nalez; n++; }
  }
  return n;
}

function zkopirujPdfWorker() {
  const zdroj = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
  const cil = join(root, 'public', 'pdf.worker.min.mjs');
  if (existsSync(zdroj)) copyFileSync(zdroj, cil);
}

function hlavni() {
  const plants = nactiRostliny();
  const sFotkou = doplnFotky(plants);
  mkdirSync(join(root, 'public', 'data'), { recursive: true });
  writeFileSync(
    join(root, 'public', 'data', 'plants.json'),
    JSON.stringify({ kategorie: KATEGORIE, rostliny: plants }, null, 1),
    'utf8'
  );
  zkopirujPdfWorker();

  const podleKat = {};
  for (const p of plants) podleKat[p.kategorie] = (podleKat[p.kategorie] || 0) + 1;
  console.log(`plants.json: ${plants.length} rostlin (${sFotkou} s fotkou)`);
  console.log(Object.entries(podleKat).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
}

// spustit jen pri primem volani, ne pri importu z import-fotky.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hlavni();
