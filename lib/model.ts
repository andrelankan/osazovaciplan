import { P, Ring, naBody, plochaBodu } from './geom';

export type Rostlina = {
  kod: string;
  latin: string;
  cesky: string;
  kat: 'T' | 'G' | 'F' | 'C' | 'K' | 'S' | 'J' | 'U';
  kategorie: string;
  svetlo: string[];
  vyska: number;
  kvet: string;
  mesice: number[];
  barva: string;
  pozn: string;
  hustota: number;
  rozestup: number;
  koruna: number;
  foto: string;
};

export type KatInfo = { nazev: string; fill: string; stroke: string; plocha: boolean };
export type Databaze = { kategorie: Record<string, KatInfo>; rostliny: Rostlina[] };

/**
 * Ploska = cast zahonu. Vznika delenim zahonu carou.
 * Nejdriv se zahon rozdeli na vyskove oblasti (`uroven`), pak se oblasti
 * deli dal na plosky jednotlivych rostlin (`kod`).
 */
export type Ploska = {
  id: string;
  ring: Ring;
  kod?: string;
  /** Vyskova oblast - je vlastnosti casti zahonu, ne samostatneho tvaru pres nej. */
  uroven?: Uroven;
  /** Rucne prepsany pocet kusu; jinak se pocita z plochy a hustoty. */
  pocet?: number;
  /** Posun popisku od automatickeho mista. */
  popisek?: P;
};

export type Zahon = { id: string; nazev: string; plosky: Ploska[] };

/** Skupina keru - lomena cara s tečkami. */
export type Skupina = {
  id: string;
  kod: string;
  body: Ring;
  rozestup?: number;
  pocet?: number;
  popisek?: P;
};

/** Strom nebo solitérní vícekmen. */
export type Solitera = {
  id: string;
  kod: string;
  pos: P;
  koruna?: number;
  vicekmen?: boolean;
  popisek?: P;
};

export type Uroven = 'nizke' | 'stredni' | 'vysoke';

export type Kota = { id: string; a: P; b: P; odsazeni: number };

export type Podklad = {
  nazev: string;
  typ: 'pdf' | 'obraz';
  klic: string;          // klic v IndexedDB
  sirkaM: number;
  vyskaM: number;
  /** Rozlisení rastru v pixelech - obrazek se vykresluje v nem, aby zustal ostry. */
  pxW: number;
  pxH: number;
  x: number;
  y: number;
  otoceni: number;
  kryti: number;
  meritko?: number;      // jmenovatel meritka, napr. 100 pro 1:100
  stranka?: number;
};

export type Projekt = {
  verze: 3;
  nazev: string;
  podklad?: Podklad;
  zahony: Zahon[];
  skupiny: Skupina[];
  solitery: Solitera[];
  koty: Kota[];
  meritkoTisk: number;
  ukazKoty: boolean;
  /** Rozkresleny krok pruvodce, aby se dalo navazat. */
  krok: number;
};

export const UROVNE: Record<Uroven, { nazev: string; kratce: string; barva: string; od: number; do: number }> = {
  nizke: { nazev: 'nízké — půdopokryvky', kratce: 'nízké', barva: '#4da3ff', od: 0, do: 0.3 },
  stredni: { nazev: 'střední', kratce: 'střední', barva: '#37c46a', od: 0.3, do: 0.8 },
  vysoke: { nazev: 'vysoké — dominanty', kratce: 'vysoké', barva: '#ff8f3f', od: 0.8, do: 99 },
};

/** Sedne rostlina do vyskove oblasti? */
export function sedneVyska(r: Rostlina, u?: Uroven): boolean {
  if (!u) return true;
  const { od, do: dd } = UROVNE[u];
  return r.vyska >= od && r.vyska <= dd;
}

export function prazdnyProjekt(nazev = 'Nový osazovací plán'): Projekt {
  return {
    verze: 3, nazev,
    zahony: [], skupiny: [], solitery: [], koty: [],
    meritkoTisk: 100, ukazKoty: true, krok: 1,
  };
}

export const id = () => Math.random().toString(36).slice(2, 9);

export const plochaPlosky = (p: Ploska) => plochaBodu(naBody(p.ring, 0.005));

/** Pocet kusu v plosce - rucni prepis, jinak plocha x hustota. */
export function pocetKusu(p: Ploska, r?: Rostlina): number {
  if (p.pocet != null) return p.pocet;
  if (!r) return 0;
  return Math.max(1, Math.round(plochaPlosky(p) * r.hustota));
}

export function popisekPlosky(p: Ploska, r?: Rostlina): string {
  if (!p.kod) return '';
  return `${p.kod}${pocetKusu(p, r)}`;
}

/** Souhrn pro vykaz rostlin. */
export type RadekVykazu = {
  kod: string; rostlina?: Rostlina; kusu: number; plocha: number; kde: string;
};

export function vykaz(pr: Projekt, db: Rostlina[]): RadekVykazu[] {
  const mapa = new Map<string, Rostlina>(db.map((r) => [r.kod, r]));
  const soucet = new Map<string, RadekVykazu>();
  const pridej = (kod: string, kusu: number, plocha: number, kde: string) => {
    if (!kod) return;
    const r = soucet.get(kod) ?? { kod, rostlina: mapa.get(kod), kusu: 0, plocha: 0, kde: '' };
    r.kusu += kusu; r.plocha += plocha;
    const kdes = new Set(r.kde ? r.kde.split(', ') : []);
    kdes.add(kde);
    r.kde = [...kdes].join(', ');
    soucet.set(kod, r);
  };
  for (const z of pr.zahony)
    for (const p of z.plosky)
      if (p.kod) pridej(p.kod, pocetKusu(p, mapa.get(p.kod)), plochaPlosky(p), z.nazev);
  for (const s of pr.skupiny) if (s.kod) pridej(s.kod, s.pocet ?? 0, 0, 'skupiny keřů');
  for (const s of pr.solitery) if (s.kod) pridej(s.kod, 1, 0, 'solitéry');
  return [...soucet.values()].sort((a, b) => {
    const ka = a.rostlina?.kat ?? 'Z', kb = b.rostlina?.kat ?? 'Z';
    const poradi = 'SJKUTGFC';
    const d = poradi.indexOf(ka) - poradi.indexOf(kb);
    return d !== 0 ? d : (a.rostlina?.latin ?? a.kod).localeCompare(b.rostlina?.latin ?? b.kod, 'cs');
  });
}
