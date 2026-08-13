import { P, Ring } from './geom';

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

/** Ktere kategorie patri do ktereho kroku - jinam se nedostanou. */
export const KATEGORIE_KROKU = {
  zahon: ['T', 'G', 'F', 'C'],
  kere: ['K', 'U'],
  stromy: ['S', 'J'],
} as const;

export type Uroven = 'nizke' | 'stredni' | 'vysoke';

export const UROVNE: Record<Uroven, { nazev: string; kratce: string; barva: string; od: number; do: number }> = {
  nizke: { nazev: 'nízké — půdopokryvky', kratce: 'nízké', barva: '#2f8fe0', od: 0, do: 0.3 },
  stredni: { nazev: 'střední', kratce: 'střední', barva: '#1f9e5a', od: 0.3, do: 0.8 },
  vysoke: { nazev: 'vysoké — dominanty', kratce: 'vysoké', barva: '#e07a1f', od: 0.8, do: 99 },
};

export function sedneVyska(r: Rostlina, u?: Uroven): boolean {
  if (!u) return true;
  const { od, do: dd } = UROVNE[u];
  return r.vyska >= od && r.vyska <= dd;
}

/** Zhruba nacrtnuty tah, ktery rekne "tady chci nizke rostliny". */
export type TahVysky = { id: string; uroven: Uroven; body: P[] };

/** Rostlina vybrana do zahonu, s podilem plochy. */
export type Osazeni = {
  kod: string;
  /** Ve ktere vyskove oblasti; prazdne = zahon bez rozdeleni na vysky. */
  uroven?: Uroven;
  /** Vzajemny pomer plochy mezi rostlinami teze oblasti. */
  podil: number;
  /** Na kolik mist v zahonu se rostlina rozdeli; prazdne = spocitat z podilu. */
  skupin?: number;
};

/** Kolik skupin dostane rostlina, kdyz to neni urcene rucne. */
export function autoSkupin(podil: number): number {
  return podil > 0.28 ? 3 : podil > 0.12 ? 2 : 1;
}

export type Zahon = {
  id: string;
  nazev: string;
  obrys: Ring;
  vysky: TahVysky[];
  osazeni: Osazeni[];
  /** Meni rozmisteni skupin, aniz by se menilo zadani. */
  semeno: number;
};

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

export type Podklad = {
  nazev: string;
  typ: 'pdf' | 'obraz';
  klic: string;
  sirkaM: number;
  vyskaM: number;
  pxW: number;
  pxH: number;
  x: number;
  y: number;
  otoceni: number;
  kryti: number;
  meritko?: number;
  stranka?: number;
};

export type Projekt = {
  verze: 5;
  nazev: string;
  podklad?: Podklad;
  zahony: Zahon[];
  skupiny: Skupina[];
  solitery: Solitera[];
  meritkoTisk: number;
  /** Popsat u každé strany záhonu její délku. */
  ukazDelky: boolean;
  /** Popsat u každé plochy její výměru v m². */
  ukazPlochy: boolean;
  /** Ukázat zvýrazňovač výškových oblastí — jen pomůcka, do výkresu nepatří. */
  ukazVysky: boolean;
  krok: number;
};

export function prazdnyProjekt(nazev = 'Nový osazovací plán'): Projekt {
  return {
    verze: 5, nazev,
    zahony: [], skupiny: [], solitery: [],
    meritkoTisk: 100, ukazDelky: false, ukazPlochy: false, ukazVysky: false, krok: 1,
  };
}

export const id = () => Math.random().toString(36).slice(2, 9);

export function prazdnyZahon(obrys: Ring, poradi: number): Zahon {
  return {
    id: id(), nazev: `Záhon ${poradi}`, obrys,
    vysky: [], osazeni: [], semeno: Math.floor(Math.random() * 100000),
  };
}

// ------------------------------------------------------------------- vykaz

export type RadekVykazu = { kod: string; rostlina?: Rostlina; kusu: number; plocha: number; kde: string };

/** Souhrn pro objednavku. `casti` prichazi z rozvrhu zahonu. */
export function vykaz(
  pr: Projekt,
  db: Rostlina[],
  castiZahonu: { nazevZahonu: string; kod?: string; kusu: number; plocha: number }[],
): RadekVykazu[] {
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

  for (const c of castiZahonu) if (c.kod) pridej(c.kod, c.kusu, c.plocha, c.nazevZahonu);
  for (const s of pr.skupiny) if (s.kod) pridej(s.kod, s.pocet ?? 0, 0, 'skupiny keřů');
  for (const s of pr.solitery) if (s.kod) pridej(s.kod, 1, 0, 'solitéry');

  return [...soucet.values()].sort((a, b) => {
    const poradi = 'SJKUTGFC';
    const d = poradi.indexOf(a.rostlina?.kat ?? 'Z') - poradi.indexOf(b.rostlina?.kat ?? 'Z');
    return d !== 0 ? d : (a.rostlina?.latin ?? a.kod).localeCompare(b.rostlina?.latin ?? b.kod, 'cs');
  });
}
