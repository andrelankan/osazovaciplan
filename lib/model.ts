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

/** Rozdeleni sortimentu v seznamu rostlin. */
export const KATEGORIE_KROKU = {
  zahon: ['T', 'G', 'F', 'C'],
  kere: ['K', 'U'],
  stromy: ['S', 'J'],
} as const;

export const NAZEV_SORTIMENTU = {
  zahon: 'Trvalky a traviny',
  kere: 'Keře',
  stromy: 'Stromy',
} as const;

/** Zakladni barevne skupiny kvetu pro filtr. */
export const BARVY_KVETU = {
  bila: { nazev: 'bílá', vzor: '#ffffff' },
  zluta: { nazev: 'žlutá', vzor: '#f0d020' },
  ruzova: { nazev: 'růžová', vzor: '#e07fa8' },
  cervena: { nazev: 'červená', vzor: '#c02030' },
  modra: { nazev: 'modrá / fialová', vzor: '#5f5fc0' },
  zelena: { nazev: 'zelená', vzor: '#9bbf6a' },
} as const;
export type BarvaKvetu = keyof typeof BARVY_KVETU;

/** Zaradi hex barvu kvetu do jedne ze zakladnich skupin. */
export function skupinaBarvy(hex: string): BarvaKvetu | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max > 235 && max - min < 26) return 'bila';
  if (max - min < 26) return null;                       // sedive listy apod.
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) * 60;
  else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
  else h = (4 + (r - g) / (max - min)) * 60;
  if (h < 0) h += 360;
  if (h < 20 || h >= 330) return r > 200 && g > 140 ? 'ruzova' : 'cervena';
  if (h < 70) return 'zluta';
  if (h < 160) return 'zelena';
  if (h < 280) return 'modra';
  return 'ruzova';
}

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

/** Stanoviste - druha vrstva zvyrazneni, nezavisla na vyskach. */
export type DruhStanoviste = 'slunce' | 'polostin' | 'stin';
export type TahStanoviste = { id: string; druh: DruhStanoviste; body: P[] };

export const STANOVISTE: Record<DruhStanoviste, { nazev: string; barva: string }> = {
  slunce: { nazev: 'slunce', barva: '#f2c94c' },
  polostin: { nazev: 'polostín', barva: '#bdb76b' },
  stin: { nazev: 'stín', barva: '#9aa0a6' },
};

/**
 * Rostlina vybrana do zahonu. Vybira se na cely zahon; kam presne prijde,
 * rozhodne rozvrh - vyskove oblasti bere jen jako voditko.
 */
export type Osazeni = {
  kod: string;
  /** Vzajemny pomer plochy mezi rostlinami zahonu. */
  podil: number;
  /** Na kolik mist v zahonu se rostlina rozdeli; prazdne = spocitat z podilu. */
  skupin?: number;
};

/** Do ktere vyskove oblasti rostlina vyskou patri. */
export function urovenRostliny(vyska: number): Uroven {
  if (vyska <= UROVNE.nizke.do) return 'nizke';
  if (vyska <= UROVNE.stredni.do) return 'stredni';
  return 'vysoke';
}

export const PORADI_UROVNI: Uroven[] = ['nizke', 'stredni', 'vysoke'];

/**
 * Kolik skupin dostane rostlina, kdyz to neni urcene rucne.
 * Cilem je ploska kolem 3 m2 - vetsi zahon se tak rozpadne na vic mist,
 * jako na rucne kreslenych planech.
 */
export function autoSkupin(podil: number, plochaZahonu: number): number {
  const celkem = Math.max(3, Math.min(16, Math.round(plochaZahonu / 3)));
  return Math.max(1, Math.min(6, Math.round(podil * celkem)));
}

/**
 * Jedna bublina v zahonu. Vznikne z rozvrhu, ale pak uz je soucasti planu -
 * jde u ni zmenit rostlinu, posunout ji nebo zvetsit na ukor sousedu.
 */
export type Bublina = { x: number; y: number; kod: string; vaha: number };

export type Zahon = {
  id: string;
  nazev: string;
  obrys: Ring;
  vysky: TahVysky[];
  /** Vyznacene stanoviste; muze se s vyskami libovolne prekryvat. */
  stanoviste?: TahStanoviste[];
  osazeni: Osazeni[];
  /** Meni rozmisteni skupin, aniz by se menilo zadani. */
  semeno: number;
  /** Zhmotnene rozvrzeni. Prazdne = spocitat znovu. */
  bubliny?: Bublina[];
  /** Zadani, pro ktere byly bubliny spocitane. */
  zadano?: Osazeni[];
  /** Hodnota `semeno` pouzita pri vypoctu. */
  semenoPouzite?: number;
};

/**
 * Co delat, kdyz se zmenilo zadani zahonu.
 *
 * Rucne doladene bubliny se maji zachovat, takze uplny prepocet se dela jen
 * tehdy, kdyz o nej uzivatel opravdu zada - zmenou podilu, poctu skupin nebo
 * prehazenim. Pouhe pridani ci odebrani druhu se doresi po castech. Uprava
 * obrysu zahonu neni duvod k nicemu: bubliny se orizavaji obrysem sami.
 */
export function jakPrepocitat(z: Zahon): 'nic' | 'cely' | 'castecne' {
  const ted = z.osazeni;
  const drive = z.zadano;
  if (!z.bubliny?.length || !drive) return ted.length ? 'cely' : 'nic';
  if (z.semeno !== z.semenoPouzite) return 'cely';

  const zmenenyPodil = ted.some((t) => {
    const d = drive.find((x) => x.kod === t.kod);
    return d && (d.podil !== t.podil || d.skupin !== t.skupin);
  });
  if (zmenenyPodil) return 'cely';

  const pribylo = ted.some((t) => !drive.some((d) => d.kod === t.kod));
  const ubylo = drive.some((d) => !ted.some((t) => t.kod === d.kod));
  const osirele = z.bubliny.some((b) => !ted.some((t) => t.kod === b.kod));
  return pribylo || ubylo || osirele ? 'castecne' : 'nic';
}

/** Jeden ker v rade. Ma vlastni druh, takze jde menit po jednom. */
export type Tecka = { x: number; y: number; kod: string };

/** Jak je popisek umisteny vuci svemu bodu. */
export type Popisek = {
  /** Posun od vychoziho mista. */
  posun?: P;
  /** Otoceni ve stupnich. */
  otoceni?: number;
  zarovnani?: 'start' | 'middle' | 'end';
};

/** Skupina keru - lomena cara s tečkami, nebo jediny kus. */
export type Skupina = {
  id: string;
  /** Vychozi druh rady; jednotlive tecky ho mohou mit jiny. */
  kod: string;
  body: Ring;
  rozestup?: number;
  /** Zhmotnene tecky. Prazdne = dopocitat z cary a rozestupu. */
  tecky?: Tecka[];
  /** Kresli se pod keri podrost (trvalky), nebo stoji v mulci samostatne. */
  podrost?: boolean;
  pocet?: number;
  popisek?: Popisek;
};

/** Strom nebo solitérní vícekmen. */
export type Solitera = {
  id: string;
  kod: string;
  pos: P;
  koruna?: number;
  vicekmen?: boolean;
  popisek?: Popisek;
};

/** Prumery znacek v metrech - kresli se v meritku jako vse ostatni. */
export const ZNACKA = { ker: 0.05, strom: 0.1 };

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
  /** Totéž pro vyznačené stanoviště. */
  ukazStanoviste: boolean;
  /** Metrová síť přes plán — pomůcka na ověření měřítka podkladu. */
  ukazSit: boolean;
  krok: number;
};

export function prazdnyProjekt(nazev = 'Nový osazovací plán'): Projekt {
  return {
    verze: 5, nazev,
    zahony: [], skupiny: [], solitery: [],
    meritkoTisk: 100, ukazDelky: false, ukazPlochy: false, ukazVysky: true,
    ukazStanoviste: true, ukazSit: false, krok: 1,
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
