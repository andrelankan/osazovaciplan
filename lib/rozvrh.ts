/**
 * Rozvrh zahonu.
 *
 * Uzivatel neobkresluje plochu pro kazdou rostlinu. Jen:
 *   - obtahne obrys zahonu,
 *   - zhruba do nej nacrtne tahy pro vyskove oblasti,
 *   - vybere, ktere rostliny v ktere oblasti maji byt.
 *
 * Zbytek dela tenhle soubor: zahon se rozrastruje na bunky, kazda bunka pripadne
 * nejblizsimu tahu (= vyskova oblast) a uvnitr oblasti nejblizsimu semenu rostliny,
 * pricemz kazda rostlina ma kapacitu podle sveho podilu. Z bunek se pak vytrasuje
 * obrys, vyhladi se a orizne obrysem zahonu - takze plochy vyplni cely zahon,
 * nikde nezustane mezera a nic nepresahne ven.
 */
import {
  P, bodProPopisek, bodVPolygonu, naBody, obalka, plochaBodu, prunik, vzdalUsecka, zjednodus,
} from './geom';
import { Osazeni, PORADI_UROVNI, Rostlina, Uroven, Zahon, autoSkupin, urovenRostliny } from './model';

export type Cast = {
  id: string;
  kod?: string;
  uroven?: Uroven;
  polygon: P[];
  plocha: number;
  kusu: number;
  popisek: P;
};

export type Rozvrh = {
  casti: Cast[];
  /** Plocha zahonu v m2. */
  plocha: number;
  /** Cast zahonu, na kterou zatim nikdo nevybral rostlinu. */
  nevyuzito: number;
};

const PRAZDNY: Rozvrh = { casti: [], plocha: 0, nevyuzito: 0 };

/** Deterministicky generator - stejne semeno da stejne rozvrzeni. */
function nahoda(semeno: number) {
  let a = semeno >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `vaha` = jaka cast bunky opravdu lezi v zahonu (okrajove bunky se orizavaji). */
type Bunka = { x: number; y: number; ix: number; iy: number; vaha: number };

export function rozvrhni(z: Zahon, db: Map<string, Rostlina>): Rozvrh {
  const obrys = naBody(z.obrys, 0.03);
  if (obrys.length < 3) return PRAZDNY;
  const o = obalka(obrys);
  const plochaZahonu = plochaBodu(obrys);
  if (plochaZahonu < 0.05) return PRAZDNY;
  // dokud nejsou nacrtnute vysky ani vybrane rostliny, neni co rastrovat
  if (!z.vysky.length && !z.osazeni.length) return { ...PRAZDNY, plocha: plochaZahonu, nevyuzito: plochaZahonu };

  // velikost bunky - kompromis mezi jemnosti tvaru a rychlosti
  const krok = Math.min(0.5, Math.max(0.06, Math.sqrt(plochaZahonu / 2600)));

  // Bunka se bere i tehdy, kdyz do zahonu zasahuje jen rohem - jinak by po obvodu
  // zustal nevyplneny prouzek az pul bunky siroky. Prebytek se na konci orizne obrysem.
  const bunky: Bunka[] = [];
  const nx = Math.ceil(o.w / krok) + 1;
  const ny = Math.ceil(o.h / krok) + 1;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = o.x0 + (ix + 0.5) * krok;
      const y = o.y0 + (iy + 0.5) * krok;
      const h = krok / 2;
      let uvnitr = 0;
      for (const q of [{ x, y }, { x: x - h, y: y - h }, { x: x + h, y: y - h },
      { x: x + h, y: y + h }, { x: x - h, y: y + h }]) {
        if (bodVPolygonu(q, obrys)) uvnitr++;
      }
      if (uvnitr) bunky.push({ x, y, ix, iy, vaha: uvnitr / 5 });
    }
  }
  if (!bunky.length) return PRAZDNY;

  // ---------------------------------------------------- vyskove oblasti
  // kazda bunka pripadne nejblizsimu nacrtnutemu tahu
  const tahy = z.vysky.filter((t) => t.body.length >= 1);
  const urovenBunky = new Int16Array(bunky.length).fill(-1);
  if (tahy.length) {
    for (let i = 0; i < bunky.length; i++) {
      let nej = Infinity, kdo = -1;
      for (let t = 0; t < tahy.length; t++) {
        const d = vzdalOdTahu(bunky[i], tahy[t].body);
        if (d < nej) { nej = d; kdo = t; }
      }
      urovenBunky[i] = kdo;
    }
  }

  const skupinyOblasti = new Map<number, number[]>();
  bunky.forEach((_, i) => {
    const k = urovenBunky[i];
    if (!skupinyOblasti.has(k)) skupinyOblasti.set(k, []);
    skupinyOblasti.get(k)!.push(i);
  });

  // ------------------------------------------------------------ rostliny
  // Rostliny se vybiraji na cely zahon. Vyskove oblasti nerozhoduji o tom,
  // ktera rostlina kam smi, jen k sobe pritahuji rostliny odpovidajici vysky.
  const casti: Cast[] = [];
  const osazeni = z.osazeni.filter((x) => db.has(x.kod));
  if (!osazeni.length) return { casti, plocha: plochaZahonu, nevyuzito: plochaZahonu };

  const vsechny = bunky.map((_, i) => i);
  const urovenCile = osazeni.map((x) => urovenRostliny(db.get(x.kod)!.vyska));
  const prirazeni = rozdelBunky(
    vsechny, bunky, osazeni, z.semeno,
    tahy.length ? (i) => (urovenBunky[i] >= 0 ? tahy[urovenBunky[i]].uroven : null) : null,
    urovenCile,
  );

  prirazeni.forEach((skupina, si) => {
    if (!skupina.bunky.length) return;
    const { kod } = osazeni[skupina.rostlina];
    const r = db.get(kod);
    for (const polygon of naPolygony(skupina.bunky, bunky, krok, o, obrys)) {
      const plocha = plochaBodu(polygon);
      if (plocha < 0.08) continue;
      casti.push({
        id: `${z.id}-${kod}-${si}-${casti.length}`,
        kod, uroven: urovenCile[skupina.rostlina], polygon, plocha,
        kusu: Math.max(1, Math.round(plocha * (r?.hustota ?? 5))),
        popisek: bodProPopisek(polygon),
      });
    }
  });

  return { casti, plocha: plochaZahonu, nevyuzito: 0 };
}

/** Vzdalenost bodu od nacrtnuteho tahu (bod, usecka nebo lomena cara). */
function vzdalOdTahu(p: P, body: P[]): number {
  if (body.length === 1) return Math.hypot(p.x - body[0].x, p.y - body[0].y);
  let nej = Infinity;
  for (let i = 1; i < body.length; i++) nej = Math.min(nej, vzdalUsecka(p, body[i - 1], body[i]));
  return nej;
}

/**
 * Rozdeli bunky mezi jednotlive skupiny rostlin tak, aby kazda dostala plochu
 * odpovidajici svemu podilu. Jedna rostlina muze mit vic skupin, takze se
 * v zahonu opakuje na vic mistech - jako na rucne kreslenych planech.
 */
function rozdelBunky(
  idx: number[],
  bunky: Bunka[],
  osazeni: Osazeni[],
  semeno: number,
  /** Vyskova oblast bunky, nebo null kdyz zadne tahy nejsou. */
  urovenBunky: ((i: number) => Uroven | null) | null,
  /** Do jake vyskove oblasti patri jednotlive rostliny. */
  urovenCile: Uroven[],
): { rostlina: number; bunky: number[] }[] {
  const rnd = nahoda(semeno);

  /**
   * Nesoulad vysky rostliny s oblasti bunky. Nasobi vzdalenost, takze rostlina
   * do sve oblasti tihne, ale hranice zustane mekka - oblasti jsou orientacni.
   */
  const nesoulad = (bunka: number, rostlina: number): number => {
    if (!urovenBunky) return 1;
    const u = urovenBunky(bunka);
    if (!u) return 1;
    const rozdil = Math.abs(PORADI_UROVNI.indexOf(u) - PORADI_UROVNI.indexOf(urovenCile[rostlina]));
    return 1 + rozdil * 1.6;
  };

  // kolik semen na rostlinu; kvota se hlida za rostlinu, ne za semeno, aby podily
  // vysly presne a jednotlive skupiny mohly byt ruzne velke
  const soucet = osazeni.reduce((a, x) => a + Math.max(0.01, x.podil), 0);
  // kvota se pocita v plose, ne v poctu bunek - okrajove bunky se pri orezu
  // zahonem zmensi a rostlina, ktera jich ma vic, by jinak dostala mensi plochu
  const celkovaVaha = idx.reduce((a, i) => a + bunky[i].vaha, 0);
  const semena: { rostlina: number; bunka: number }[] = [];
  const kvota: number[] = [];
  for (let i = 0; i < osazeni.length; i++) {
    const podil = Math.max(0.01, osazeni[i].podil) / soucet;
    kvota.push(podil * celkovaVaha);
    const pocetSkupin = Math.max(1, Math.min(6, osazeni[i].skupin ?? autoSkupin(podil)));
    for (let s = 0; s < pocetSkupin; s++) semena.push({ rostlina: i, bunka: -1 });
  }

  // Rozeseti semen co nejdal od sebe, at skupiny nesplynou. Semeno se pritom
  // radeji posadi do oblasti, ktera odpovida vysce jeho rostliny.
  const vzdal = new Float64Array(idx.length).fill(Infinity);
  const vhodnost = (i: number, s: number) => 1 / nesoulad(idx[i], semena[s].rostlina) ** 2;

  {
    let nejI = 0, nejS = -1;
    for (let i = 0; i < idx.length; i++) {
      const skore = vhodnost(i, 0) * (0.7 + rnd() * 0.6);
      if (skore > nejS) { nejS = skore; nejI = i; }
    }
    semena[0].bunka = idx[nejI];
    vzdal[nejI] = 0;
  }
  for (let s = 1; s < semena.length; s++) {
    const posledni = bunky[semena[s - 1].bunka];
    let nejI = 0, nejD = -1;
    for (let i = 0; i < idx.length; i++) {
      const b = bunky[idx[i]];
      const d = (b.x - posledni.x) ** 2 + (b.y - posledni.y) ** 2;
      if (d < vzdal[i]) vzdal[i] = d;
      // trocha nahody, aby rozmisteni nebylo pokazde vizualne stejne
      const skore = vzdal[i] * vhodnost(i, s) * (0.85 + rnd() * 0.3);
      if (skore > nejD) { nejD = skore; nejI = i; }
    }
    semena[s].bunka = idx[nejI];
    vzdal[nejI] = 0;
  }

  // kazda bunka k nejblizsimu semenu, ale jen dokud ma semeno volnou kapacitu
  const dvojice: { b: number; s: number; d: number }[] = [];
  for (const i of idx) {
    for (let s = 0; s < semena.length; s++) {
      const c = bunky[semena[s].bunka];
      const d2 = (bunky[i].x - c.x) ** 2 + (bunky[i].y - c.y) ** 2;
      dvojice.push({ b: i, s, d: d2 * nesoulad(i, semena[s].rostlina) ** 2 });
    }
  }
  dvojice.sort((a, b) => a.d - b.d);

  const vysledek = semena.map((s) => ({ rostlina: s.rostlina, bunky: [] as number[] }));
  const zbyva = [...kvota];
  const hotovo = new Set<number>();
  for (const d of dvojice) {
    if (hotovo.has(d.b)) continue;
    const r = semena[d.s].rostlina;
    if (zbyva[r] <= 0) continue;
    vysledek[d.s].bunky.push(d.b);
    zbyva[r] -= bunky[d.b].vaha;
    hotovo.add(d.b);
  }
  // zbytek (kvoty vychazeji na desetiny bunky) k nejblizsimu semenu
  for (const d of dvojice) {
    if (hotovo.has(d.b)) continue;
    vysledek[d.s].bunky.push(d.b);
    hotovo.add(d.b);
  }
  return vysledek;
}

/**
 * Z mnoziny bunek udela vyhlazene polygony orizle obrysem zahonu.
 */
function naPolygony(
  idx: number[], bunky: Bunka[], krok: number, o: { x0: number; y0: number }, obrys: P[],
): P[][] {
  const je = new Set<number>();
  const klic = (ix: number, iy: number) => ix * 100000 + iy;
  for (const i of idx) je.add(klic(bunky[i].ix, bunky[i].iy));

  // Hranicni hrany mrizky, orientovane tak, aby na sebe navazovaly.
  // Z jednoho rohu jich muze vychazet vic (kdyz se plocha dotyka sama sebe
  // pres uhlopricku), proto seznam - drivejsi verze hranu prepsala a obrys
  // se rozpadl, coz zpusobilo, ze plocha zmizela.
  type Hrana = [number, number, number, number];
  const hrany = new Map<string, Hrana[]>();
  const bod = (i: number, j: number) => `${i}|${j}`;
  let zbyvaHran = 0;
  const pridej = (h: Hrana) => {
    const k = bod(h[0], h[1]);
    const s = hrany.get(k);
    if (s) s.push(h); else hrany.set(k, [h]);
    zbyvaHran++;
  };
  for (const i of idx) {
    const { ix, iy } = bunky[i];
    if (!je.has(klic(ix, iy - 1))) pridej([ix, iy, ix + 1, iy]);
    if (!je.has(klic(ix + 1, iy))) pridej([ix + 1, iy, ix + 1, iy + 1]);
    if (!je.has(klic(ix, iy + 1))) pridej([ix + 1, iy + 1, ix, iy + 1]);
    if (!je.has(klic(ix - 1, iy))) pridej([ix, iy + 1, ix, iy]);
  }

  const polygony: P[][] = [];
  while (zbyvaHran > 0) {
    let start = '';
    for (const [k, s] of hrany) if (s.length) { start = k; break; }
    if (!start) break;

    const kruh: P[] = [];
    let akt = start;
    let smer: [number, number] | null = null;
    while (true) {
      const seznam = hrany.get(akt);
      if (!seznam || !seznam.length) break;
      // v rozcesti pokracuj rovne, jinak doprava - obrys tak drzi jednu plochu
      let vyber = 0;
      if (seznam.length > 1 && smer) {
        let nej = -Infinity;
        seznam.forEach((h, i) => {
          const d: [number, number] = [h[2] - h[0], h[3] - h[1]];
          const vpred = smer![0] * d[0] + smer![1] * d[1];
          const vpravo = smer![0] * d[1] - smer![1] * d[0];
          const skore = vpred * 2 + vpravo;
          if (skore > nej) { nej = skore; vyber = i; }
        });
      }
      const h = seznam.splice(vyber, 1)[0];
      zbyvaHran--;
      kruh.push({ x: o.x0 + h[0] * krok, y: o.y0 + h[1] * krok });
      smer = [h[2] - h[0], h[3] - h[1]];
      akt = bod(h[2], h[3]);
      if (akt === start) break;
    }
    if (kruh.length < 4) continue;
    // vyhlazuje se jeste na surovem "schodisti" z bunek, kde je kazdy usek dlouhy
    // jednu bunku - zaobli se tim jen schody. Zjednoduseni az potom; obracene
    // poradi by z dlouhych rovnych stran udelalo oblouky a plocha by se srazila.
    const hladky = zjednodus(vyhlad(kruh, 2), krok * 0.12);
    if (plochaBodu(hladky) < 0.05) continue;
    // orez obrysem zahonu - vyhlazeni muze mirne vybocit ven
    for (const cast of prunik(hladky, obrys)) {
      if (plochaBodu(cast) > 0.05) polygony.push(cast);
    }
  }
  return polygony;
}

/** Chaikinovo vyhlazeni - z hranatych bunek udela prirozeny tvar zahonu. */
function vyhlad(body: P[], kroku: number): P[] {
  let akt = body;
  for (let k = 0; k < kroku; k++) {
    if (akt.length < 4) break;
    const dalsi: P[] = [];
    for (let i = 0; i < akt.length; i++) {
      const a = akt[i], b = akt[(i + 1) % akt.length];
      dalsi.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      dalsi.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    akt = dalsi;
  }
  return akt;
}
