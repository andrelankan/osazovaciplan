'use client';
import { useMemo } from 'react';
import { Projekt, Rostlina, Zahon } from './model';
import { Rozvrh, rozvrhni } from './rozvrh';
import { useStore } from './store';

/**
 * Rozvrh se pocita z tvaru zahonu, nacrtnutych vysek a vyberu rostlin.
 * Je to nejdrazsi operace v aplikaci, tak se vysledky drzi v pameti podle
 * otisku zadani - pri posouvani obrysu se prepocita jen upravovany zahon.
 */
const cache = new Map<string, Rozvrh>();

function otisk(z: Zahon, verzeDb: number): string {
  return JSON.stringify([z.obrys, z.vysky, z.osazeni, z.semeno, z.bubliny, verzeDb]);
}

export function rozvrhZahonu(z: Zahon, db: Map<string, Rostlina>, verzeDb: number): Rozvrh {
  const k = otisk(z, verzeDb);
  const mam = cache.get(k);
  if (mam) return mam;
  const v = rozvrhni(z, db);
  if (cache.size > 60) cache.clear();
  cache.set(k, v);
  return v;
}

export function rozvrhyProjektu(pr: Projekt, db: Rostlina[]): Map<string, Rozvrh> {
  const mapa = new Map(db.map((r) => [r.kod, r]));
  const verze = db.length;
  return new Map(pr.zahony.map((z) => [z.id, rozvrhZahonu(z, mapa, verze)]));
}

export function useRozvrhy(): Map<string, Rozvrh> {
  const pr = useStore((s) => s.pr);
  const db = useStore((s) => s.db);
  return useMemo(() => rozvrhyProjektu(pr, db), [pr, db]);
}
