'use client';
import React, { useRef } from 'react';
import { obalka, naBody } from '@/lib/geom';
import { prazdnyProjekt } from '@/lib/model';
import { prevedProjekt, useStore } from '@/lib/store';

export default function Lista() {
  const { pr, historie, budoucnost } = useStore();
  const st = useStore;
  const soubor = useRef<HTMLInputElement>(null);

  const naObrazovku = () => {
    const body: { x: number; y: number }[] = [];
    for (const z of pr.zahony) for (const p of z.plosky) body.push(...naBody(p.ring, 0.1));
    for (const s of pr.skupiny) body.push(...s.body);
    for (const s of pr.solitery) body.push(s.pos);
    if (!body.length && pr.podklad) body.push(
      { x: pr.podklad.x, y: pr.podklad.y },
      { x: pr.podklad.x + pr.podklad.sirkaM, y: pr.podklad.y + pr.podklad.vyskaM },
    );
    if (!body.length) return;
    const o = obalka(body);
    st.getState().setKamera({
      x: (o.x0 + o.x1) / 2, y: (o.y0 + o.y1) / 2,
      z: Math.max(2, Math.min(400, Math.min((window.innerWidth - 700) / (o.w || 1), (window.innerHeight - 120) / (o.h || 1)) * 0.9)),
    });
  };

  const ulozSoubor = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pr, null, 1)], { type: 'application/json' }));
    a.download = `${pr.nazev.replace(/\W+/g, '-').toLowerCase() || 'plan'}.plan.json`;
    a.click();
  };

  const otevriSoubor = async (f: File) => {
    try {
      const p = prevedProjekt(JSON.parse(await f.text()));
      if (!p) throw new Error('neznámý formát souboru');
      st.getState().nastavProjekt(p);
      st.getState().set('podkladUrl', null);
      setTimeout(naObrazovku, 50);
    } catch (e) { alert('Soubor se nepodařilo otevřít: ' + (e as Error).message); }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-gray-300 bg-white px-3 py-1.5 text-sm">
      <span className="font-semibold text-emerald-800">Osazovací plán</span>
      <input value={pr.nazev} onChange={(e) => st.getState().zmen((d) => { d.nazev = e.target.value; })}
        className="w-64 rounded border border-gray-200 px-2 py-1 text-sm" />

      <div className="mx-1 h-5 w-px bg-gray-300" />
      <button onClick={() => { if (confirm('Založit nový prázdný plán? Rozpracovaný se ztratí.')) st.getState().nastavProjekt(prazdnyProjekt()); }}
        className={btn}>Nový</button>
      <button onClick={() => soubor.current?.click()} className={btn}>Otevřít</button>
      <button onClick={ulozSoubor} className={btn}>Uložit</button>
      <input ref={soubor} type="file" accept=".json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) otevriSoubor(f); e.target.value = ''; }} />

      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => st.getState().zpet()} disabled={!historie.length} className={btn}>← Zpět</button>
        <button onClick={() => st.getState().vpred()} disabled={!budoucnost.length} className={btn}>Vpřed →</button>
        <button onClick={naObrazovku} className={btn}>Na obrazovku</button>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={pr.ukazKoty}
            onChange={() => st.getState().zmen((d) => { d.ukazKoty = !d.ukazKoty; })} /> kóty
        </label>
        <button onClick={() => window.open('/tisk', '_blank')} className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700">
          Tisk / PDF
        </button>
      </div>
    </div>
  );
}

const btn = 'rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100 disabled:opacity-40';
