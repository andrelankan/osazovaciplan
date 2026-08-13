'use client';
import { useEffect } from 'react';
import Lista from '@/components/Lista';
import Plan from '@/components/Plan';
import Pruvodce, { BocniPanel } from '@/components/Pruvodce';
import { nactiUlozeny, useStore } from '@/lib/store';
import { nacti } from '@/lib/idb';

export default function Stranka() {
  const nacteno = useStore((s) => s.nacteno);
  const st = useStore;

  useEffect(() => {
    st.getState().nactiDb();
    const ulozeny = nactiUlozeny();
    if (ulozeny) {
      st.getState().nastavProjekt(ulozeny);
      if (ulozeny.podklad) {
        nacti(ulozeny.podklad.klic).then((v) => {
          if (v instanceof Blob) st.getState().set('podkladUrl', URL.createObjectURL(v));
          else if (typeof v === 'string') st.getState().set('podkladUrl', v);
        }).catch(() => { });
      }
    }
  }, [st]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-gray-900">
      <Lista />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {nacteno
            ? <><Plan /><Pruvodce /></>
            : <div className="p-8 text-gray-500">Načítám databázi rostlin…</div>}
        </div>
        <BocniPanel />
      </div>
    </div>
  );
}
