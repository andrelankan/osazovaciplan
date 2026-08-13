'use client';
import { create } from 'zustand';
import { P, V } from './geom';
import { Databaze, KatInfo, Projekt, Rostlina, Uroven, prazdnyProjekt } from './model';

export type Nastroj =
  | 'vyber' | 'zahon' | 'rez' | 'uroven' | 'kere' | 'strom' | 'kota' | 'kalibrace';

export const NASTROJE: Record<Nastroj, { nazev: string; popis: string }> = {
  vyber: { nazev: 'Výběr', popis: 'Vybírat, posouvat body, ohýbat strany' },
  zahon: { nazev: 'Obrys záhonu', popis: 'Klikáním obkreslit obrys, Enter uzavře' },
  rez: { nazev: 'Rozdělit čarou', popis: 'Tahem přes záhon ho rozdělit na dvě části' },
  uroven: { nazev: 'Označit výšku', popis: 'Kliknutím přiřadit části záhonu výškovou oblast' },
  kere: { nazev: 'Skupina keřů', popis: 'Naklikat řadu, Enter dokončí' },
  strom: { nazev: 'Strom / solitéra', popis: 'Kliknutím osadit strom' },
  kota: { nazev: 'Kóta', popis: 'Dva kliky = okótovaná vzdálenost' },
  kalibrace: { nazev: 'Kalibrace', popis: 'Dva body o známé vzdálenosti určí měřítko' },
};

export type Vyber =
  | { typ: 'ploska'; zahon: string; ploska: string }
  | { typ: 'skupina'; id: string }
  | { typ: 'solitera'; id: string }
  | { typ: 'kota'; id: string }
  | null;

type Stav = {
  pr: Projekt;
  db: Rostlina[];
  kategorie: Record<string, KatInfo>;
  nacteno: boolean;

  nastroj: Nastroj;
  vyber: Vyber;
  aktivniKod: string | null;
  /** Uroven, kterou nastroj "Označit výšku" prirazuje. */
  urovenStetec: Uroven;
  /** Cim se plosky vybarvuji: podle rostlin, nebo podle vyskovych oblasti. */
  zobrazeni: 'rostliny' | 'vysky';
  zalozka: 'katalog' | 'vlastnosti' | 'vykaz';

  kamera: { x: number; y: number; z: number };   // z = pixelu na metr
  koncept: V[];
  mysWorld: P | null;
  podkladUrl: string | null;

  historie: Projekt[];
  budoucnost: Projekt[];

  nactiDb: () => Promise<void>;
  upravRostlinu: (kod: string, zmeny: Partial<Rostlina>) => void;
  zmen: (fn: (p: Projekt) => void) => void;
  /** Zmena bez zapisu do historie - pro prubeh tazeni mysi. */
  zmenTiche: (fn: (p: Projekt) => void) => void;
  /** Jeden snimek do historie - vola se na zacatku tazeni. */
  pamatuj: () => void;
  nastavProjekt: (p: Projekt) => void;
  zpet: () => void;
  vpred: () => void;
  set: <K extends keyof Stav>(kl: K, h: Stav[K]) => void;
  setKamera: (k: Partial<{ x: number; y: number; z: number }>) => void;
};

const KLIC = 'osazovaci-plan:projekt';
const KLIC_UPRAV = 'osazovaci-plan:upravy-rostlin';

/** Rucni upravy databaze (hustota, koruna...) - drzi se lokalne vedle plants.json. */
function nactiUpravy(): Record<string, Partial<Rostlina>> {
  try { return JSON.parse(localStorage.getItem(KLIC_UPRAV) ?? '{}'); } catch { return {}; }
}

function uloz(p: Projekt) {
  try { localStorage.setItem(KLIC, JSON.stringify(p)); } catch { /* plno */ }
}

export function nactiUlozeny(): Projekt | null {
  try {
    const s = localStorage.getItem(KLIC);
    return s ? prevedProjekt(JSON.parse(s)) : null;
  } catch { return null; }
}

/** Starsi plany (verze 2 mela vyskove zony jako samostatne tvary) se prenesou. */
export function prevedProjekt(p: unknown): Projekt | null {
  if (!p || typeof p !== 'object') return null;
  const x = p as Record<string, unknown>;
  if (x.verze === 3) return p as Projekt;
  if (x.verze === 2) {
    const n = { ...x } as unknown as Projekt & { zony?: unknown; ukazZony?: unknown; ukazSazenice?: unknown };
    delete n.zony; delete n.ukazZony; delete n.ukazSazenice;
    n.verze = 3; n.krok = 1;
    return n as Projekt;
  }
  return null;
}

const klon = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const useStore = create<Stav>((set, get) => ({
  pr: prazdnyProjekt(),
  db: [],
  kategorie: {},
  nacteno: false,

  nastroj: 'vyber',
  vyber: null,
  aktivniKod: null,
  urovenStetec: 'nizke',
  zobrazeni: 'rostliny',
  zalozka: 'katalog',

  kamera: { x: 0, y: 0, z: 40 },
  koncept: [],
  mysWorld: null,
  podkladUrl: null,

  historie: [],
  budoucnost: [],

  async nactiDb() {
    const r = await fetch('/data/plants.json');
    const d: Databaze = await r.json();
    const upravy = nactiUpravy();
    const db = d.rostliny.map((x) => (upravy[x.kod] ? { ...x, ...upravy[x.kod] } : x));
    set({ db, kategorie: d.kategorie, nacteno: true });
  },

  upravRostlinu(kod, zmeny) {
    const upravy = nactiUpravy();
    upravy[kod] = { ...upravy[kod], ...zmeny };
    try { localStorage.setItem(KLIC_UPRAV, JSON.stringify(upravy)); } catch { }
    set({ db: get().db.map((r) => (r.kod === kod ? { ...r, ...zmeny } : r)) });
  },

  zmen(fn) {
    const { pr, historie } = get();
    const novy = klon(pr);
    fn(novy);
    set({ pr: novy, historie: [...historie.slice(-49), pr], budoucnost: [] });
    uloz(novy);
  },

  zmenTiche(fn) {
    const novy = klon(get().pr);
    fn(novy);
    set({ pr: novy });
    uloz(novy);
  },

  pamatuj() {
    const { pr, historie } = get();
    set({ historie: [...historie.slice(-49), klon(pr)], budoucnost: [] });
  },

  nastavProjekt(p) {
    set({ pr: p, historie: [], budoucnost: [], vyber: null, koncept: [] });
    uloz(p);
  },

  zpet() {
    const { historie, pr, budoucnost } = get();
    if (!historie.length) return;
    const predchozi = historie[historie.length - 1];
    set({ pr: predchozi, historie: historie.slice(0, -1), budoucnost: [pr, ...budoucnost].slice(0, 50), vyber: null });
    uloz(predchozi);
  },

  vpred() {
    const { budoucnost, pr, historie } = get();
    if (!budoucnost.length) return;
    const dalsi = budoucnost[0];
    set({ pr: dalsi, budoucnost: budoucnost.slice(1), historie: [...historie, pr] });
    uloz(dalsi);
  },

  set: (kl, h) => set({ [kl]: h } as never),
  setKamera: (k) => set({ kamera: { ...get().kamera, ...k } }),
}));

export const useRostlina = (kod?: string | null) =>
  useStore((s) => (kod ? s.db.find((r) => r.kod === kod) : undefined));
