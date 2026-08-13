'use client';
import React, { useRef } from 'react';
import { Projekt, prazdnyProjekt } from '@/lib/model';
import { useStore } from '@/lib/store';

/** Uplne horni lista - jen to, co plati po celou dobu prace. */
export default function Lista() {
  const { pr, historie, budoucnost } = useStore();
  const st = useStore;
  const soubor = useRef<HTMLInputElement>(null);

  // vlastni srovnani pohledu umi platno, ktere jako jedine zna svoji velikost
  const naObrazovku = () => window.dispatchEvent(new CustomEvent('plan:naObrazovku'));

  const ulozSoubor = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pr, null, 1)], { type: 'application/json' }));
    a.download = `${pr.nazev.replace(/\W+/g, '-').toLowerCase() || 'plan'}.plan.json`;
    a.click();
  };

  const otevriSoubor = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as Projekt;
      if (p?.verze !== 5) throw new Error('soubor je z jiné verze aplikace');
      st.getState().nastavProjekt(p);
      st.getState().set('podkladUrl', null);
      setTimeout(naObrazovku, 50);
    } catch (e) { alert('Soubor se nepodařilo otevřít: ' + (e as Error).message); }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-1.5 text-sm">
      <span className="font-semibold text-emerald-800">Osazovací plán</span>
      <input value={pr.nazev} onChange={(e) => st.getState().zmen((d) => { d.nazev = e.target.value; })}
        className="w-56 rounded border border-transparent px-2 py-1 hover:border-gray-300 focus:border-gray-400 focus:outline-none" />

      <div className="ml-auto flex items-center gap-1 text-gray-600">
        <button onClick={() => st.getState().zpet()} disabled={!historie.length} title="Zpět (Ctrl+Z)" className={btn}>↶</button>
        <button onClick={() => st.getState().vpred()} disabled={!budoucnost.length} title="Vpřed" className={btn}>↷</button>
        <button onClick={naObrazovku} className={btn}>Na obrazovku</button>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button onClick={() => soubor.current?.click()} className={btn}>Otevřít</button>
        <button onClick={ulozSoubor} className={btn}>Uložit</button>
        <button onClick={() => { if (confirm('Založit nový prázdný plán? Rozpracovaný se ztratí.')) st.getState().nastavProjekt(prazdnyProjekt()); }}
          className={btn}>Nový</button>
        <input ref={soubor} type="file" accept=".json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) otevriSoubor(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

const btn = 'rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30';
