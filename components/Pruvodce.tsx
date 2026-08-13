'use client';
import React, { useRef, useState } from 'react';
import Katalog from '@/components/Katalog';
import { KATEGORIE_KROKU, Rostlina, UROVNE, Uroven, Zahon, autoSkupin, vykaz } from '@/lib/model';
import { KROKY, Krok, useStore } from '@/lib/store';
import { useRozvrhy } from '@/lib/useRozvrhy';
import { nactiPodklad } from '@/lib/podklad';
import { smaz } from '@/lib/idb';

/** Jedna veta, co se ma prave ted delat. Nic jineho na obrazovce nesviti. */
const POKYN: Record<Krok, string> = {
  1: 'Nahraj plánek zahrady a řekni, v jakém je měřítku.',
  2: 'Obkresli po plánku okraj záhonu. Klikáním, Enter uzavře.',
  3: 'Zvýrazňovačem přejeď zhruba tam, kde chceš nízké a kde vysoké rostliny. Je to jen pomůcka pro rozmístění — do výkresu se nekreslí a klidně může přesahovat.',
  4: 'Vyber rostliny do záhonu. Plochy si rozvrhne sám.',
  5: 'Vyber keř a naklikej řadu. Enter dokončí.',
  6: 'Vyber strom a klikni, kam ho zasadit.',
  7: 'Hotovo. Přepínači si zapni, co má být na výkrese vidět, a vytiskni.',
};

export default function Pruvodce() {
  const pr = useStore((s) => s.pr);
  const krok = pr.krok as Krok;

  return (
    <>
      {/* pokyn pres platno */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-lg bg-white/95 px-3 py-2 shadow-md ring-1 ring-black/5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Krok {krok} ze 7 · {KROKY[krok - 1].nazev}
        </div>
        <div className="text-sm text-gray-700">{POKYN[krok]}</div>
      </div>

      {/* ovladani kroku dole uprostred */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-4xl items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5">
          <Navigace />
        </div>
      </div>
    </>
  );
}

function Navigace() {
  const { pr } = useStore();
  const st = useStore;
  const krok = pr.krok as Krok;
  const jdi = (k: number) => st.getState().naKrok(Math.max(1, Math.min(7, k)) as Krok);

  return (
    <>
      <button onClick={() => jdi(krok - 1)} disabled={krok === 1}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30">← Zpět</button>
      <div className="flex items-center gap-1 px-1">
        {KROKY.map((k) => (
          <button key={k.cislo} onClick={() => jdi(k.cislo)} title={k.nazev}
            className={`h-2 rounded-full transition-all ${k.cislo === krok ? 'w-7 bg-emerald-600' : 'w-2 bg-gray-300 hover:bg-gray-400'}`} />
        ))}
      </div>
      <KrokAkce />
      <button onClick={() => jdi(krok + 1)} disabled={krok === 7}
        className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-30">
        Další →
      </button>
    </>
  );
}

/** Akce, ktere davaji smysl jen v danem kroku. */
function KrokAkce() {
  const { pr, aktivniZahon, urovenStetec, upravovat, prichytavat, koncept } = useStore();
  const st = useStore;
  const krok = pr.krok as Krok;
  const podkladInput = useRef<HTMLInputElement>(null);
  const [meritko, setMeritko] = useState(pr.podklad?.meritko ?? 100);
  const [nacita, setNacita] = useState(false);
  const zahon = pr.zahony.find((z) => z.id === aktivniZahon) ?? pr.zahony[0];

  const vlozPodklad = async (f: File) => {
    setNacita(true);
    try {
      const { podklad, url } = await nactiPodklad(f, meritko);
      const stary = st.getState().pr.podklad?.klic;
      if (stary) smaz(stary).catch(() => { });
      st.getState().zmen((d) => { d.podklad = podklad; });
      st.getState().set('podkladUrl', url);
      st.getState().setKamera({
        x: podklad.sirkaM / 2, y: podklad.vyskaM / 2,
        z: Math.max(2, (window.innerWidth - 480) / podklad.sirkaM),
      });
    } catch (e) {
      alert('Podklad se nepodařilo načíst: ' + (e as Error).message);
    } finally { setNacita(false); }
  };

  if (krok === 1) {
    return (
      <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
        <label className="flex items-center gap-1 text-sm text-gray-600">
          měřítko&nbsp;1:
          <input type="number" value={meritko} onChange={(e) => setMeritko(+e.target.value || 100)}
            className="w-16 rounded border px-1 py-1 text-sm" />
        </label>
        <button onClick={() => podkladInput.current?.click()} disabled={nacita}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {nacita ? 'Načítám…' : pr.podklad ? 'Nahradit plánek' : 'Nahrát plánek (PDF)'}
        </button>
        <input ref={podkladInput} type="file" accept="application/pdf,image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) vlozPodklad(f); e.target.value = ''; }} />
        {pr.podklad && (
          <label className="flex items-center gap-1 text-xs text-gray-500">
            krytí
            <input type="range" min={0.1} max={1} step={0.05} value={pr.podklad.kryti} className="w-20"
              onChange={(e) => st.getState().zmen((d) => { if (d.podklad) d.podklad.kryti = +e.target.value; })} />
          </label>
        )}
      </div>
    );
  }

  if (krok === 2) {
    return (
      <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
        <Prepinac zapnuto={!upravovat} onClick={() => st.getState().set('upravovat', false)}>Kreslit nový</Prepinac>
        <Prepinac zapnuto={upravovat} onClick={() => { st.getState().set('upravovat', true); st.getState().set('koncept', []); }}>
          Upravit tvar
        </Prepinac>
        <Prepinac zapnuto={prichytavat} onClick={() => st.getState().set('prichytavat', !prichytavat)}>
          Přichytávat
        </Prepinac>
        {!upravovat && koncept.length >= 3 && (
          <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white">Uzavřít záhon</button>
        )}
        {pr.zahony.length > 0 && <span className="text-xs text-gray-500">{pr.zahony.length}× záhon</span>}
      </div>
    );
  }

  if (krok === 3) {
    return (
      <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
        {(Object.keys(UROVNE) as Uroven[]).map((u) => (
          <button key={u} onClick={() => st.getState().set('urovenStetec', u)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${urovenStetec === u ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            style={urovenStetec === u ? { background: UROVNE[u].barva } : undefined}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: urovenStetec === u ? '#fff' : UROVNE[u].barva }} />
            {UROVNE[u].kratce}
          </button>
        ))}
        {zahon && zahon.vysky.length > 0 && (
          <button onClick={() => st.getState().zmen((d) => {
            const x = d.zahony.find((y) => y.id === zahon.id);
            if (x) x.vysky.pop();
          })} className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100">
            Zpět tah ({zahon.vysky.length})
          </button>
        )}
      </div>
    );
  }

  if (krok === 7) {
    return (
      <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
        <Prepinac zapnuto={pr.ukazDelky} onClick={() => st.getState().zmen((d) => { d.ukazDelky = !d.ukazDelky; })}>
          Délky stran
        </Prepinac>
        <Prepinac zapnuto={pr.ukazPlochy} onClick={() => st.getState().zmen((d) => { d.ukazPlochy = !d.ukazPlochy; })}>
          Výměry m²
        </Prepinac>
        <Prepinac zapnuto={pr.ukazVysky} onClick={() => st.getState().zmen((d) => { d.ukazVysky = !d.ukazVysky; })}>
          Zvýraznění výšek
        </Prepinac>
        <button onClick={() => window.open('/tisk', '_blank')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white">Tisk / PDF</button>
      </div>
    );
  }

  return null;
}

function Prepinac({ zapnuto, onClick, children }: { zapnuto: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-sm ${zapnuto ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
      {children}
    </button>
  );
}

// ============================================================ bocni panel

/** Panel vpravo se ukazuje jen v krocich, kde se vybiraji rostliny. */
export function BocniPanel() {
  const pr = useStore((s) => s.pr);
  const krok = pr.krok as Krok;
  if (krok === 4) return <PanelZahonu />;
  if (krok === 5) return <PanelDrevin kategorie={KATEGORIE_KROKU.kere} nadpis="Keře do skupiny" />;
  if (krok === 6) return <PanelDrevin kategorie={KATEGORIE_KROKU.stromy} nadpis="Strom / solitéra" />;
  if (krok === 7) return <PanelVykazu />;
  return null;
}

const OBAL = 'flex h-full w-[340px] shrink-0 flex-col border-l border-gray-200 bg-white';

/** Krok 4 - vyber rostlin do zahonu, podil plochy, prehazeni rozvrzeni. */
function PanelZahonu() {
  const { pr, db, aktivniZahon } = useStore();
  const st = useStore;
  const rozvrhy = useRozvrhy();
  const zahon = pr.zahony.find((z) => z.id === aktivniZahon) ?? pr.zahony[0];
  const [pridava, setPridava] = useState<Uroven | 'vse' | null>(null);

  if (!zahon) {
    return <div className={OBAL}><p className="p-4 text-sm text-gray-500">Nejdřív nakresli záhon (krok 2).</p></div>;
  }

  const rozvrh = rozvrhy.get(zahon.id);
  const urovne = [...new Set(zahon.vysky.map((v) => v.uroven))];
  const sekce: (Uroven | undefined)[] = urovne.length ? urovne : [undefined];

  const uprav = (fn: (z: Zahon) => void) =>
    st.getState().zmen((d) => { const x = d.zahony.find((y) => y.id === zahon.id); if (x) fn(x); });

  const pridej = (r: Rostlina, uroven?: Uroven) => {
    uprav((z) => {
      if (z.osazeni.some((o) => o.kod === r.kod && o.uroven === uroven)) return;
      z.osazeni.push({ kod: r.kod, uroven, podil: 1 });
    });
    setPridava(null);
  };

  if (pridava !== null) {
    const uroven = pridava === 'vse' ? undefined : pridava;
    return (
      <div className={OBAL}>
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <span className="text-sm font-medium">
            Přidat rostlinu {uroven && <span style={{ color: UROVNE[uroven].barva }}>· {UROVNE[uroven].kratce}</span>}
          </span>
          <button onClick={() => setPridava(null)} className="text-sm text-gray-500 hover:text-gray-900">Zavřít</button>
        </div>
        <Katalog kategorie={KATEGORIE_KROKU.zahon} uroven={uroven} vyska
          vybrane={zahon.osazeni.filter((o) => o.uroven === uroven).map((o) => o.kod)}
          onVyber={(r) => pridej(r, uroven)} />
      </div>
    );
  }

  return (
    <div className={OBAL}>
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{zahon.nazev}</span>
          <span className="text-xs text-gray-500">{rozvrh?.plocha.toFixed(1)} m²</span>
        </div>
        {pr.zahony.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {pr.zahony.map((z) => (
              <button key={z.id} onClick={() => st.getState().set('aktivniZahon', z.id)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${z.id === zahon.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {z.nazev}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {sekce.map((uroven) => {
          const radky = zahon.osazeni.filter((o) => o.uroven === uroven);
          const soucet = radky.reduce((a, x) => a + Math.max(0.01, x.podil), 0) || 1;
          return (
            <div key={uroven ?? 'vse'} className="border-b border-gray-100 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                {uroven
                  ? <><span className="h-2.5 w-2.5 rounded-full" style={{ background: UROVNE[uroven].barva }} />
                    {UROVNE[uroven].nazev}</>
                  : <span className="text-gray-500">celý záhon</span>}
              </div>

              {radky.map((o) => {
                const r = db.find((x) => x.kod === o.kod);
                const kusu = (rozvrh?.casti ?? [])
                  .filter((c) => c.kod === o.kod && c.uroven === uroven)
                  .reduce((a, c) => a + c.kusu, 0);
                return (
                  <div key={o.kod} className="mb-1 rounded border border-gray-200 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold">{o.kod}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] italic">{r?.latin}</span>
                      <span className="text-[11px] text-gray-500">{kusu} ks</span>
                      <button onClick={() => uprav((z) => {
                        z.osazeni = z.osazeni.filter((x) => !(x.kod === o.kod && x.uroven === uroven));
                      })} className="text-gray-400 hover:text-red-600">×</button>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <input type="range" min={0.2} max={5} step={0.1} value={o.podil} className="flex-1"
                        onChange={(e) => uprav((z) => {
                          const x = z.osazeni.find((y) => y.kod === o.kod && y.uroven === uroven);
                          if (x) x.podil = +e.target.value;
                        })} />
                      <span className="w-10 text-right text-[11px] text-gray-500">
                        {Math.round((Math.max(0.01, o.podil) / soucet) * 100)} %
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                      <span>skupin v záhonu:</span>
                      {([undefined, 1, 2, 3, 4, 5] as (number | undefined)[]).map((n) => (
                        <button key={n ?? 'auto'} onClick={() => uprav((z) => {
                          const x = z.osazeni.find((y) => y.kod === o.kod && y.uroven === uroven);
                          if (x) x.skupin = n;
                        })}
                          className={`rounded px-1.5 py-0.5 ${o.skupin === n ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>
                          {n ?? 'auto'}
                        </button>
                      ))}
                      {o.skupin == null && <span className="text-gray-400">({autoSkupin(Math.max(0.01, o.podil) / soucet)})</span>}
                    </div>
                  </div>
                );
              })}

              <button onClick={() => setPridava(uroven ?? 'vse')}
                className="w-full rounded border border-dashed border-gray-300 py-1.5 text-sm text-gray-600 hover:border-emerald-500 hover:text-emerald-700">
                + přidat rostlinu
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 p-2">
        <button onClick={() => uprav((z) => { z.semeno = Math.floor(Math.random() * 100000); })}
          className="w-full rounded border border-gray-300 py-1.5 text-sm hover:bg-gray-50">
          Přeházet rozmístění
        </button>
        {rozvrh && rozvrh.nevyuzito > 0.5 && (
          <p className="mt-1 text-[11px] text-amber-700">
            {rozvrh.nevyuzito.toFixed(1)} m² zatím bez rostlin
            {zahon.vysky.length ? ' — v některé výškové oblasti nemáš nic vybraného.' : '.'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Kroky 5 a 6 - vyber dreviny, ktera se pak kresli do planu. */
function PanelDrevin({ kategorie, nadpis }: { kategorie: readonly string[]; nadpis: string }) {
  const { aktivniKod, db, pr } = useStore();
  const st = useStore;
  const aktivni = db.find((r) => r.kod === aktivniKod);
  const krok = pr.krok;

  return (
    <div className={OBAL}>
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="text-sm font-medium">{nadpis}</div>
        {aktivni
          ? <div className="mt-0.5 text-xs text-gray-600">kreslí se <span className="italic">{aktivni.latin}</span></div>
          : <div className="mt-0.5 text-xs text-amber-700">vyber ze seznamu, pak klikni do plánu</div>}
      </div>
      <Katalog kategorie={kategorie} vybrane={aktivniKod ? [aktivniKod] : []}
        onVyber={(r) => st.getState().set('aktivniKod', r.kod)} />
      <div className="border-t border-gray-200 p-2 text-xs text-gray-500">
        {krok === 5
          ? `${pr.skupiny.length}× skupina keřů v plánu`
          : `${pr.solitery.length}× strom v plánu`}
      </div>
    </div>
  );
}

/** Krok 7 - vykaz rostlin. */
function PanelVykazu() {
  const { pr, db, kategorie } = useStore();
  const rozvrhy = useRozvrhy();
  const casti = pr.zahony.flatMap((z) =>
    (rozvrhy.get(z.id)?.casti ?? []).map((c) => ({ nazevZahonu: z.nazev, kod: c.kod, kusu: c.kusu, plocha: c.plocha })));

  const radky = vykaz(pr, db, casti);
  const celkem = radky.reduce((a, r) => a + r.kusu, 0);

  const csv = () => {
    const hlavicka = ['Kód', 'Latinský název', 'Český název', 'Kategorie', 'Ks', 'Plocha m2', 'Umístění'];
    const telo = radky.map((r) => [r.kod, r.rostlina?.latin ?? '', r.rostlina?.cesky ?? '',
    r.rostlina?.kategorie ?? '', String(r.kusu), r.plocha ? r.plocha.toFixed(2) : '', r.kde]);
    const txt = '﻿' + [hlavicka, ...telo].map((r) => r.map((b) => `"${b.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `vykaz-${pr.nazev.replace(/\W+/g, '-').toLowerCase()}.csv`;
    a.click();
  };

  return (
    <div className={OBAL}>
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-medium">Výkaz rostlin</span>
        <button onClick={csv} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">CSV</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <table className="w-full text-xs">
          <tbody>
            {radky.map((r) => (
              <tr key={r.kod} className="border-b border-gray-100">
                <td className="py-1">
                  <span className="rounded px-1 py-0.5 text-[11px] font-bold"
                    style={{ background: kategorie[r.rostlina?.kat ?? 'T']?.fill }}>{r.kod}</span>
                </td>
                <td className="py-1">
                  <span className="block italic">{r.rostlina?.latin ?? '—'}</span>
                  <span className="block text-[11px] text-gray-500">{r.rostlina?.cesky}</span>
                </td>
                <td className="text-right font-medium">{r.kusu}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!radky.length && <p className="p-4 text-sm text-gray-500">Zatím nic nevysazeno.</p>}
      </div>
      <div className="border-t border-gray-200 px-3 py-2 text-sm">
        celkem <b>{celkem}</b> ks · {radky.length} druhů
      </div>
    </div>
  );
}

