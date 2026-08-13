'use client';
import React, { useMemo, useState } from 'react';
import { Rostlina, UROVNE, Uroven, sedneVyska } from '@/lib/model';
import { useStore } from '@/lib/store';

/**
 * Nabidka rostlin. Vzdycky omezena na kategorie, ktere do daneho kroku patri -
 * u stromu se trvalky vubec nezobrazi.
 */
export default function Katalog({
  kategorie: povolene, uroven, vybrane, onVyber, vyska,
}: {
  kategorie: readonly string[];
  uroven?: Uroven;
  vybrane?: string[];
  onVyber: (r: Rostlina) => void;
  /** Zvyraznit rostliny mimo vyskovy rozsah oblasti. */
  vyska?: boolean;
}) {
  const db = useStore((s) => s.db);
  const katInfo = useStore((s) => s.kategorie);
  const [hledej, setHledej] = useState('');
  const [kat, setKat] = useState('');
  const [svetlo, setSvetlo] = useState('');

  const seznam = useMemo(() => {
    const q = hledej.trim().toLowerCase();
    let v = db.filter((r) => {
      if (!povolene.includes(r.kat)) return false;
      if (kat && r.kat !== kat) return false;
      if (svetlo && !r.svetlo.includes(svetlo)) return false;
      if (q && !`${r.kod} ${r.latin} ${r.cesky}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (uroven && vyska) {
      const u = UROVNE[uroven];
      const stred = (u.od + Math.min(u.do, 2)) / 2;
      v = [...v].sort((a, b) =>
        Number(!sedneVyska(a, uroven)) - Number(!sedneVyska(b, uroven))
        || Math.abs(a.vyska - stred) - Math.abs(b.vyska - stred));
    }
    return v;
  }, [db, povolene, kat, svetlo, hledej, uroven, vyska]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-gray-200 p-2">
        <input value={hledej} onChange={(e) => setHledej(e.target.value)}
          placeholder="Hledat…" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <div className="flex items-center gap-1 text-xs">
          {povolene.length > 1 && (
            <select value={kat} onChange={(e) => setKat(e.target.value)} className="rounded border px-1 py-1">
              <option value="">vše</option>
              {povolene.map((k) => <option key={k} value={k}>{katInfo[k]?.nazev}</option>)}
            </select>
          )}
          <select value={svetlo} onChange={(e) => setSvetlo(e.target.value)} className="rounded border px-1 py-1">
            <option value="">stanoviště</option>
            <option value="slunce">slunce</option>
            <option value="polostín">polostín</option>
            <option value="stín">stín</option>
          </select>
          <span className="ml-auto text-gray-400">{seznam.length}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {seznam.map((r) => {
          const uz = vybrane?.includes(r.kod);
          const mimo = vyska && uroven && !sedneVyska(r, uroven);
          return (
            <button key={r.kod} onClick={() => onVyber(r)}
              className={`flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-[13px]
                ${uz ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'} ${mimo ? 'opacity-40' : ''}`}>
              <span className="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold"
                style={{ background: katInfo[r.kat]?.fill }}>{r.kod}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate italic">{r.latin}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  {r.cesky} · {r.vyska} m · {r.kvet || 'nekvete'}
                </span>
              </span>
              {uz && <span className="text-emerald-600">✓</span>}
            </button>
          );
        })}
        {!seznam.length && <p className="p-4 text-sm text-gray-500">Nic neodpovídá filtru.</p>}
      </div>
    </div>
  );
}
