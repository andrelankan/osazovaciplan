'use client';
import React, { useMemo, useState } from 'react';
import {
  BARVY_KVETU, BarvaKvetu, KATEGORIE_KROKU, NAZEV_SORTIMENTU, Rostlina, UROVNE, Uroven,
  skupinaBarvy, urovenRostliny,
} from '@/lib/model';
import { useStore } from '@/lib/store';

const VYSKY: { id: string; nazev: string; od: number; do: number }[] = [
  { id: 'a', nazev: 'do 0,3 m', od: 0, do: 0.3 },
  { id: 'b', nazev: '0,3–0,8 m', od: 0.3, do: 0.8 },
  { id: 'c', nazev: '0,8–1,5 m', od: 0.8, do: 1.5 },
  { id: 'd', nazev: 'nad 1,5 m', od: 1.5, do: 999 },
];

/**
 * Seznam rostlin je porad videt a klikanim se rostliny pridavaji.
 * Sortiment se prepina nahore, ne krokem pruvodce.
 */
export default function Katalog({
  vybrane, onVyber, oznacenaUroven,
}: {
  vybrane: string[];
  onVyber: (r: Rostlina) => void;
  /** Zvyrazni rostliny, ktere sednou do teto vyskove oblasti. */
  oznacenaUroven?: Uroven | null;
}) {
  const db = useStore((s) => s.db);
  const katInfo = useStore((s) => s.kategorie);
  const sortiment = useStore((s) => s.sortiment);
  const st = useStore;

  const [hledej, setHledej] = useState('');
  const [svetlo, setSvetlo] = useState('');
  const [mesic, setMesic] = useState(0);
  const [vyska, setVyska] = useState('');
  const [barva, setBarva] = useState<BarvaKvetu | ''>('');
  const [vicFiltru, setVicFiltru] = useState(false);

  const povolene: readonly string[] = KATEGORIE_KROKU[sortiment];

  const seznam = useMemo(() => {
    const q = hledej.trim().toLowerCase();
    const v = VYSKY.find((x) => x.id === vyska);
    return db.filter((r) => {
      if (!povolene.includes(r.kat)) return false;
      if (svetlo && !r.svetlo.includes(svetlo)) return false;
      if (mesic && !r.mesice.includes(mesic)) return false;
      if (v && !(r.vyska >= v.od && r.vyska <= v.do)) return false;
      if (barva && skupinaBarvy(r.barva) !== barva) return false;
      if (q && !`${r.kod} ${r.latin} ${r.cesky} ${r.pozn}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [db, povolene, hledej, svetlo, mesic, vyska, barva]);

  const filtrujeSe = svetlo || mesic || vyska || barva || hledej.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* prepinac sortimentu */}
      <div className="flex gap-1 border-b border-gray-200 px-2 pt-2">
        {(Object.keys(KATEGORIE_KROKU) as (keyof typeof KATEGORIE_KROKU)[]).map((s) => (
          <button key={s} onClick={() => st.getState().set('sortiment', s)}
            className={`rounded-t px-2.5 py-1 text-xs ${sortiment === s
              ? 'bg-gray-900 font-medium text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {NAZEV_SORTIMENTU[s]}
          </button>
        ))}
      </div>

      {/* filtry */}
      <div className="space-y-1.5 border-b border-gray-200 p-2">
        <input value={hledej} onChange={(e) => setHledej(e.target.value)}
          placeholder="Hledat název, kód, poznámku…" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <select value={vyska} onChange={(e) => setVyska(e.target.value)} className="rounded border px-1 py-1">
            <option value="">výška: vše</option>
            {VYSKY.map((v) => <option key={v.id} value={v.id}>{v.nazev}</option>)}
          </select>
          <select value={mesic} onChange={(e) => setMesic(+e.target.value)} className="rounded border px-1 py-1">
            <option value={0}>kvete: kdykoli</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>kvete v {i + 1}.</option>)}
          </select>
          <button onClick={() => setVicFiltru(!vicFiltru)}
            className="rounded border border-gray-300 px-1.5 py-1 text-gray-600 hover:bg-gray-100">
            {vicFiltru ? '− méně' : '+ více'}
          </button>
          <span className="ml-auto text-gray-400">{seznam.length}</span>
        </div>

        {vicFiltru && (
          <div className="space-y-1.5">
            <select value={svetlo} onChange={(e) => setSvetlo(e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
              <option value="">stanoviště: vše</option>
              <option value="slunce">slunce</option>
              <option value="polostín">polostín</option>
              <option value="stín">stín</option>
            </select>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(BARVY_KVETU) as BarvaKvetu[]).map((b) => (
                <button key={b} onClick={() => setBarva(barva === b ? '' : b)} title={BARVY_KVETU[b].nazev}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]
                    ${barva === b ? 'border-gray-800 font-medium' : 'border-gray-300 text-gray-600'}`}>
                  <span className="h-3 w-3 rounded-full border border-gray-300" style={{ background: BARVY_KVETU[b].vzor }} />
                  {BARVY_KVETU[b].nazev}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtrujeSe && (
          <button onClick={() => { setHledej(''); setSvetlo(''); setMesic(0); setVyska(''); setBarva(''); }}
            className="text-[11px] text-emerald-700 underline">zrušit filtry</button>
        )}
      </div>

      {/* seznam */}
      <div className="min-h-0 flex-1 overflow-auto">
        {seznam.map((r) => {
          const uz = vybrane.includes(r.kod);
          const u = urovenRostliny(r.vyska);
          const sedne = !oznacenaUroven || u === oznacenaUroven;
          return (
            <button key={r.kod} onClick={() => onVyber(r)}
              className={`flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-[13px]
                ${uz ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'} ${sedne ? '' : 'opacity-45'}`}>
              <span className="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold"
                style={{ background: katInfo[r.kat]?.fill }}>{r.kod}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate italic">{r.latin}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  {r.cesky} · {r.vyska} m · {r.kvet || 'nekvete'}
                </span>
              </span>
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" title={UROVNE[u].kratce}
                style={{ background: UROVNE[u].barva, opacity: 0.65 }} />
              {uz && <span className="text-emerald-600">✓</span>}
            </button>
          );
        })}
        {!seznam.length && <p className="p-4 text-sm text-gray-500">Nic neodpovídá filtru.</p>}
      </div>
    </div>
  );
}
