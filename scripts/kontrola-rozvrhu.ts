/**
 * Smoke test rozvrhu zahonu:  npx tsx scripts/kontrola-rozvrhu.ts
 *
 * Overuje to, co jde zmerit - ze plochy vyplni cely zahon, nepresahnou ven
 * a ze pomer ploch odpovida zadanym podilum.
 */
import { P, plochaBodu, bodVPolygonu, naBody, vzdalUsecka } from '../lib/geom';
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
  console.log(`  oblastí: ${r.oblasti.length}, ploch: ${r.casti.length}, součet ${soucet.toFixed(2)} m² z ${r.plocha.toFixed(2)} m²`);
  for (const ob of r.oblasti) {
    const plochaOblasti = ob.polygony.reduce((a, pg) => a + plochaBodu(pg), 0);
    const plochaCasti = r.casti.filter((c) => c.uroven === ob.uroven).reduce((a, c) => a + c.plocha, 0);
    console.log(`    ${ob.uroven}: oblast ${plochaOblasti.toFixed(2)} m², rostliny v ní ${plochaCasti.toFixed(2)} m²`);
    zkontroluj(Math.abs(plochaOblasti - plochaCasti) < 0.5, `oblast ${ob.uroven} je osázená celá`);
  }

  zkontroluj(r.oblasti.length === 2, 'vznikly dvě výškové oblasti');
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

console.log(chyb ? `\n${chyb} chyb\n` : '\nvše v pořádku\n');
process.exit(chyb ? 1 : 0);
void plochaBodu;
