/**
 * Smoke test rozvrhu zahonu:  npx tsx scripts/kontrola-rozvrhu.ts
 *
 * Overuje to, co jde zmerit - ze plochy vyplni cely zahon, nepresahnou ven
 * a ze pomer ploch odpovida zadanym podilum.
 */
import { P, bodVPolygonu, bulgeZBodu, naBody, vzdalUsecka } from '../lib/geom';
import { Rostlina, Zahon } from '../lib/model';
import { rozvrhni } from '../lib/rozvrh';

const R = (kod: string, vyska: number, hustota: number): Rostlina => ({
  kod, latin: kod, cesky: kod, kat: 'T', kategorie: 'trvalka', svetlo: ['slunce'],
  vyska, kvet: '', mesice: [], barva: '', pozn: '', hustota,
  rozestup: 1, koruna: 1, foto: '',
});

const db = new Map<string, Rostlina>([
  ['Aaa', R('Aaa', 0.2, 9)],
  ['Bbb', R('Bbb', 0.5, 5)],
  ['Ccc', R('Ccc', 1.2, 3)],
]);

const obdelnik = (w: number, h: number) => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];

let chyb = 0;
const zkontroluj = (podminka: boolean, popis: string, detail = '') => {
  console.log(`${podminka ? '  ok  ' : ' CHYBA'} ${popis}${detail ? ' — ' + detail : ''}`);
  if (!podminka) chyb++;
};

/** O kolik metru bod vycniva ven z polygonu (0 = uvnitr nebo presne na hrane). */
const presah = (p: P, polygon: P[]) => {
  if (bodVPolygonu(p, polygon)) return 0;
  let nej = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    nej = Math.min(nej, vzdalUsecka(p, polygon[j], polygon[i]));
  }
  return nej;
};
const maxPresah = (body: P[], polygon: P[]) => body.reduce((a, p) => Math.max(a, presah(p, polygon)), 0);

// ------------------------------------------------- 1. zahon bez vysek
{
  const z: Zahon = {
    id: 'z1', nazev: 'test', obrys: obdelnik(8, 5), vysky: [], semeno: 42,
    osazeni: [
      { kod: 'Aaa', podil: 2 },
      { kod: 'Bbb', podil: 1 },
      { kod: 'Ccc', podil: 1 },
    ],
  };
  const r = rozvrhni(z, db);
  const soucet = r.casti.reduce((a, c) => a + c.plocha, 0);
  console.log(`\nZáhon 8×5 m bez výškových oblastí, 3 rostliny v poměru 2:1:1`);
  console.log(`  ploch: ${r.casti.length}, součet ${soucet.toFixed(2)} m² z ${r.plocha.toFixed(2)} m²`);

  zkontroluj(r.casti.length >= 3, 'vznikla plocha pro každou rostlinu');
  zkontroluj(soucet > r.plocha * 0.93, 'plochy vyplní záhon', `${((soucet / r.plocha) * 100).toFixed(1)} %`);
  zkontroluj(soucet <= r.plocha * 1.02, 'plochy nepřesáhnou záhon');

  for (const kod of ['Aaa', 'Bbb', 'Ccc']) {
    const p = r.casti.filter((c) => c.kod === kod).reduce((a, c) => a + c.plocha, 0);
    const cil = kod === 'Aaa' ? 0.5 : 0.25;
    zkontroluj(Math.abs(p / soucet - cil) < 0.06,
      `podíl ${kod} odpovídá zadání`, `${((p / soucet) * 100).toFixed(1)} % místo ${cil * 100} %`);
  }

  // zadny bod plochy nesmi lezet mimo zahon
  const obrys = naBody(z.obrys, 0.02);
  const ven = maxPresah(r.casti.flatMap((c) => c.polygon), obrys);
  zkontroluj(ven < 0.02, 'žádná plocha nepřesahuje ven ze záhonu', `max ${(ven * 1000).toFixed(0)} mm`);

  // popisek musi byt uvnitr sve plochy
  const spatnyPopisek = r.casti.filter((c) => !bodVPolygonu(c.popisek, c.polygon)).length;
  zkontroluj(spatnyPopisek === 0, 'popisky leží uvnitř svých ploch', `${spatnyPopisek} mimo`);
}

// ------------------------------------------------- 2. zahon s vyskami
{
  const z: Zahon = {
    id: 'z2', nazev: 'test2', obrys: obdelnik(10, 6), semeno: 7,
    vysky: [
      { id: 'v1', uroven: 'nizke', body: [{ x: 1, y: 5 }, { x: 9, y: 5 }] },
      { id: 'v2', uroven: 'vysoke', body: [{ x: 1, y: 1 }, { x: 9, y: 1 }] },
    ],
    osazeni: [
      { kod: 'Aaa', uroven: 'nizke', podil: 1 },
      { kod: 'Ccc', uroven: 'vysoke', podil: 1 },
    ],
  };
  const r = rozvrhni(z, db);
  const soucet = r.casti.reduce((a, c) => a + c.plocha, 0);
  console.log(`\nZáhon 10×6 m, dva tahy (nízké dole, vysoké nahoře)`);
  console.log(`  ploch: ${r.casti.length}, součet ${soucet.toFixed(2)} m² z ${r.plocha.toFixed(2)} m²`);
  for (const u of ['nizke', 'vysoke'] as const) {
    const p = r.casti.filter((c) => c.uroven === u).reduce((a, c) => a + c.plocha, 0);
    console.log(`    ${u}: ${p.toFixed(2)} m²`);
    zkontroluj(p > 20, `oblast ${u} je osázená`);
  }
  zkontroluj(soucet > r.plocha * 0.93, 'osazení vyplní celý záhon', `${((soucet / r.plocha) * 100).toFixed(1)} %`);

  // nizke musi byt dole (vetsi y), vysoke nahore
  const nizke = r.casti.filter((c) => c.uroven === 'nizke');
  const vysoke = r.casti.filter((c) => c.uroven === 'vysoke');
  const tezisteY = (cs: typeof r.casti) => cs.reduce((a, c) => a + c.popisek.y * c.plocha, 0) / cs.reduce((a, c) => a + c.plocha, 0);
  zkontroluj(tezisteY(nizke) > tezisteY(vysoke),
    'nízké rostliny sedí u tahu pro nízké', `nízké y=${tezisteY(nizke).toFixed(2)}, vysoké y=${tezisteY(vysoke).toFixed(2)}`);
  zkontroluj(nizke.every((c) => c.kod === 'Aaa') && vysoke.every((c) => c.kod === 'Ccc'),
    'do oblasti se dostaly jen rostliny do ní vybrané');
}

// ------------------------------------------------- 3. slozity tvar
{
  const L = [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 7 }, { x: 0, y: 7 },
  ];
  const z: Zahon = {
    id: 'z3', nazev: 'L', obrys: L, vysky: [], semeno: 3,
    osazeni: [{ kod: 'Aaa', podil: 1 }, { kod: 'Bbb', podil: 1 }],
  };
  const r = rozvrhni(z, db);
  const soucet = r.casti.reduce((a, c) => a + c.plocha, 0);
  console.log(`\nZáhon do L (nekonvexní tvar)`);
  console.log(`  ploch: ${r.casti.length}, součet ${soucet.toFixed(2)} m² z ${r.plocha.toFixed(2)} m²`);
  zkontroluj(Math.abs(r.plocha - 36) < 0.2, 'plocha L tvaru je spočítaná správně', `${r.plocha.toFixed(2)} m²`);
  zkontroluj(soucet > r.plocha * 0.9, 'plochy vyplní i nekonvexní tvar', `${((soucet / r.plocha) * 100).toFixed(1)} %`);
  const obrys = naBody(z.obrys, 0.02);
  const ven = maxPresah(r.casti.flatMap((c) => c.polygon), obrys);
  zkontroluj(ven < 0.02, 'nic nepřeteklo do výřezu tvaru L', `max ${(ven * 1000).toFixed(0)} mm`);
}

// ------------------------------- 4. rucne nacmarane tahy pres cely zahon
// Klikatice davaji rozeklane oblasti, ktere se dotykaji jen pres uhlopricku -
// tam se drive trasovani obrysu rozpadlo a plochy zmizely uplne.
{
  const klikatice = (y0: number, uroven: 'nizke' | 'stredni' | 'vysoke') => ({
    id: 'v' + y0, uroven,
    body: Array.from({ length: 26 }, (_, i) => ({
      x: 0.4 + i * 0.36,
      y: y0 + Math.sin(i * 1.1) * 1.25 + Math.cos(i * 0.37) * 0.5,
    })),
  });
  const z: Zahon = {
    id: 'z4', nazev: 'čmáranice', obrys: obdelnik(10, 8), semeno: 99,
    vysky: [klikatice(1.6, 'vysoke'), klikatice(4, 'stredni'), klikatice(6.4, 'nizke')],
    osazeni: [
      { kod: 'Ccc', uroven: 'vysoke', podil: 1 },
      { kod: 'Bbb', uroven: 'stredni', podil: 1 },
      { kod: 'Aaa', uroven: 'nizke', podil: 2 },
      { kod: 'Bbb', uroven: 'nizke', podil: 1 },
    ],
  };
  const r = rozvrhni(z, db);
  const soucet = r.casti.reduce((a, c) => a + c.plocha, 0);
  console.log(`\nZáhon 10×8 m, tři ručně načmárané klikatice`);
  console.log(`  ploch: ${r.casti.length}, součet ${soucet.toFixed(2)} m² z ${r.plocha.toFixed(2)} m²`);
  zkontroluj(r.casti.length >= 4, 'plochy vůbec vznikly', `${r.casti.length}`);
  zkontroluj(soucet > r.plocha * 0.93, 'rozeklané oblasti vyplní záhon', `${((soucet / r.plocha) * 100).toFixed(1)} %`);
  const obrys = naBody(z.obrys, 0.02);
  zkontroluj(maxPresah(r.casti.flatMap((c) => c.polygon), obrys) < 0.02, 'nic nepřesahuje ven');
  for (const u of ['nizke', 'stredni', 'vysoke'] as const) {
    zkontroluj(r.casti.some((c) => c.uroven === u), `oblast ${u} má svoje plochy`);
  }
}

// ------------------------------------- 5. oblouk musi projit tazenym bodem
{
  console.log('\nVyklenutí strany do oblouku');
  const a = { x: 0, y: 0 }, b = { x: 6, y: 0 };
  for (const cil of [{ x: 3, y: 0.2 }, { x: 3, y: 2 }, { x: 3, y: -3.5 }, { x: 2, y: 1.2 }]) {
    const bulge = bulgeZBodu(a, b, cil);
    const krivka = naBody([{ ...a, b: bulge }, b], 0.002, false);
    // merit na usecky krivky, ne na jeji vrcholy - jinak by se merila jen hustota vzorkovani
    let nej = Infinity;
    for (let i = 1; i < krivka.length; i++) nej = Math.min(nej, vzdalUsecka(cil, krivka[i - 1], krivka[i]));
    zkontroluj(nej < 0.03, `oblouk projde bodem ${cil.x};${cil.y}`, `odchylka ${(nej * 1000).toFixed(0)} mm`);
  }
}

console.log(chyb ? `\n${chyb} chyb\n` : '\nvše v pořádku\n');
process.exit(chyb ? 1 : 0);
