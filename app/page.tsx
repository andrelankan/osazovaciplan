'use client';
import { useEffect } from 'react';
import Kroky from '@/components/Kroky';
import Lista from '@/components/Lista';
import Panel from '@/components/Panel';
import Plan from '@/components/Plan';
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100 text-gray-900">
      <Lista />
      <div className="flex min-h-0 flex-1">
        <Kroky />
        <div className="min-w-0 flex-1">
          {nacteno ? <Plan /> : <div className="p-8 text-gray-500">Načítám databázi rostlin…</div>}
        </div>
        <Panel />
      </div>
    </div>
  );
}
