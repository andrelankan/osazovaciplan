'use client';
import { create } from 'zustand';
import { P, V } from './geom';
import { Databaze, KatInfo, Projekt, Rostlina, Uroven, prazdnyProjekt } from './model';

/** Krok pruvodce urcuje, co jde v danou chvili delat - jine ovladani neni videt. */
export type Krok = 1 | 2 | 3 | 4 | 5;

export const KROKY: { cislo: Krok; nazev: string; kratce: string }[] = [
  { cislo: 1, nazev: 'Podklad zahrady', kratce: 'Podklad' },
  { cislo: 2, nazev: 'Obrys záhonu', kratce: 'Záhon' },
  { cislo: 3, nazev: 'Výškové oblasti', kratce: 'Výšky' },
  { cislo: 4, nazev: 'Rostlinný materiál', kratce: 'Rostliny' },
  { cislo: 5, nazev: 'Hotovo — tisk a výkaz', kratce: 'Tisk' },
];

export const POSLEDNI_KROK = 5;

type Stav = {
  pr: Projekt;
  db: Rostlina[];
  kategorie: Record<string, KatInfo>;
  nacteno: boolean;

  /** Zahon, na kterem se zrovna pracuje (kroky 3 a 4). */
  aktivniZahon: string | null;
  aktivniKod: string | null;
  urovenStetec: Uroven;
  /** V kroku 2: upravovat existujici obrys misto kresleni noveho. */
  upravovat: boolean;
  /** Prichytavat kresleni k jiz nakreslenym bodum a caram. */
  prichytavat: boolean;
  /** V kroku 1: rezim mereni vzdalenosti / kalibrace meritka. */
  meri: boolean;
  /** Vybrana skupina keru - jde u ni menit rozestup i druh. */
  vybranaSkupina: string | null;
  /** Ktera cast sortimentu je v seznamu videt. */
  sortiment: 'zahon' | 'kere' | 'stromy';
  /** Rozestup pro nove kreslenou skupinu; null = vzit vychozi u rostliny. */
  rozestupNovy: number | null;

  kamera: { x: number; y: number; z: number };
  koncept: V[];
  podkladUrl: string | null;

  historie: Projekt[];
  budoucnost: Projekt[];

  nactiDb: () => Promise<void>;
  upravRostlinu: (kod: string, zmeny: Partial<Rostlina>) => void;
  zmen: (fn: (p: Projekt) => void) => void;
  nastavProjekt: (p: Projekt) => void;
  naKrok: (k: Krok) => void;
  zpet: () => void;
  vpred: () => void;
  set: <K extends keyof Stav>(kl: K, h: Stav[K]) => void;
  setKamera: (k: Partial<{ x: number; y: number; z: number }>) => void;
};

const KLIC = 'osazovaci-plan:projekt';
const KLIC_UPRAV = 'osazovaci-plan:upravy-rostlin';

function nactiUpravy(): Record<string, Partial<Rostlina>> {
  try { return JSON.parse(localStorage.getItem(KLIC_UPRAV) ?? '{}'); } catch { return {}; }
}

function uloz(p: Projekt) {
  try { localStorage.setItem(KLIC, JSON.stringify(p)); } catch { /* plno */ }
}

export function nactiUlozeny(): Projekt | null {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return null;
    const p = JSON.parse(s);
    return p?.verze === 5 ? (p as Projekt) : null;
  } catch { return null; }
}

const klon = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const useStore = create<Stav>((set, get) => ({
  pr: prazdnyProjekt(),
  db: [],
  kategorie: {},
  nacteno: false,

  aktivniZahon: null,
  aktivniKod: null,
  urovenStetec: 'nizke',
  upravovat: false,
  prichytavat: true,
  meri: false,
  vybranaSkupina: null,
  sortiment: 'zahon',
  rozestupNovy: null,

  kamera: { x: 0, y: 0, z: 40 },
  koncept: [],
  podkladUrl: null,

  historie: [],
  budoucnost: [],

  async nactiDb() {
    const r = await fetch('/data/plants.json');
    const d: Databaze = await r.json();
    const upravy = nactiUpravy();
    set({
      db: d.rostliny.map((x) => (upravy[x.kod] ? { ...x, ...upravy[x.kod] } : x)),
      kategorie: d.kategorie,
      nacteno: true,
    });
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
    set({ pr: novy, historie: [...historie.slice(-39), pr], budoucnost: [] });
    uloz(novy);
  },

  nastavProjekt(p) {
    set({ pr: p, historie: [], budoucnost: [], koncept: [], aktivniZahon: p.zahony[0]?.id ?? null });
    uloz(p);
  },

  naKrok(k) {
    get().zmen((d) => { d.krok = k; });
    const s = get();
    set({
      koncept: [], upravovat: false, meri: false, vybranaSkupina: null, rozestupNovy: null,
      aktivniZahon: s.aktivniZahon ?? s.pr.zahony[0]?.id ?? null,
      aktivniKod: null,
    });
  },

  zpet() {
    const { historie, pr, budoucnost } = get();
    if (!historie.length) return;
    const predchozi = historie[historie.length - 1];
    set({ pr: predchozi, historie: historie.slice(0, -1), budoucnost: [pr, ...budoucnost].slice(0, 40) });
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

export type { P };
