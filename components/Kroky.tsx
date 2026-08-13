'use client';
import React, { useEffect, useRef, useState } from 'react';
import { UROVNE, Uroven } from '@/lib/model';
import { NASTROJE, Nastroj, useStore } from '@/lib/store';
import { nactiPodklad } from '@/lib/podklad';
import { smaz } from '@/lib/idb';

type Krok = {
  cislo: number;
  nazev: string;
  nastroje: Nastroj[];
  zobrazeni: 'rostliny' | 'vysky';
  navod: React.ReactNode;
  hotovo: (s: ReturnType<typeof useStore.getState>) => boolean;
};

const KROKY: Krok[] = [
  {
    cislo: 1, nazev: 'Podklad a měřítko', nastroje: ['kalibrace'], zobrazeni: 'rostliny',
    hotovo: (s) => !!s.pr.podklad,
    navod: (
      <>
        <p>Nahraj situaci zahrady jako <b>PDF</b> a zadej měřítko, ve kterém je vykreslená (obvykle 1:100). Skutečné rozměry se z toho spočítají samy.</p>
        <p>U obrázku (JPG/PNG) měřítko známé není — vezmi nástroj <b>Kalibrace</b>, klikni na dva body, u kterých znáš vzdálenost, a zadej ji v metrech.</p>
      </>
    ),
  },
  {
    cislo: 2, nazev: 'Obrys záhonu', nastroje: ['zahon', 'vyber'], zobrazeni: 'rostliny',
    hotovo: (s) => s.pr.zahony.length > 0,
    navod: (
      <>
        <p>Nástrojem <b>Obrys záhonu</b> obkresli po podkladu okraj záhonu. <b>Enter</b> ho uzavře.</p>
        <p><b>Shift</b> drží úhel po 45°. Zmáčkni <b>číslici</b> a zadáš přesnou délku a úhel strany.</p>
        <p>Oblé strany: přepni na <b>Výběr</b>, chyť kulaté táhlo uprostřed strany a táhni. Přesnou hodnotu lze napsat vpravo ve <b>Vlastnostech</b>.</p>
      </>
    ),
  },
  {
    cislo: 3, nazev: 'Výškové oblasti', nastroje: ['rez', 'uroven', 'vyber'], zobrazeni: 'vysky',
    hotovo: (s) => s.pr.zahony.some((z) => z.plosky.some((p) => p.uroven)),
    navod: (
      <>
        <p>Nástrojem <b>Rozdělit čarou</b> táhni přes záhon a rozpadne se na dvě části. Takhle si ho rozděl na oblasti podle výšky výsadby.</p>
        <p>Pak vezmi <b>Označit výšku</b>, zvol si dole úroveň a klikáním ji částem záhonu přiřaď. Opětovné kliknutí označení zruší.</p>
        <p className="text-gray-500">Oblasti jsou součástí záhonu, ne kresba přes něj — když plochu později rozdělíš na jednotlivé rostliny, výška se přenese do obou částí.</p>
      </>
    ),
  },
  {
    cislo: 4, nazev: 'Rostliny do ploch', nastroje: ['rez', 'vyber'], zobrazeni: 'rostliny',
    hotovo: (s) => s.pr.zahony.some((z) => z.plosky.some((p) => p.kod)),
    navod: (
      <>
        <p><b>Rozdělit čarou</b> rozděl výškové oblasti dál na plošky jednotlivých rostlin.</p>
        <p>Pak nástrojem <b>Výběr</b> <b>klikni na plošku</b> a vpravo v katalogu <b>klikni na rostlinu</b> — do plánu se vypíše zkratka a počet kusů, spočítaný z plochy a hustoty výsadby.</p>
        <p className="text-gray-500">Uvnitř výškové oblasti nabídne katalog nahoře rostliny odpovídající výšky.</p>
      </>
    ),
  },
  {
    cislo: 5, nazev: 'Keře a stromy', nastroje: ['kere', 'strom', 'vyber'], zobrazeni: 'rostliny',
    hotovo: (s) => s.pr.skupiny.length > 0 || s.pr.solitery.length > 0,
    navod: (
      <>
        <p>Nejdřív <b>vyber rostlinu v katalogu vpravo</b>, teprve pak kresli.</p>
        <p><b>Skupina keřů</b> — naklikej řadu a dej <b>Enter</b>. Vykreslí se jako spojené tečky s celým názvem kurzívou, počet vyjde z délky řady a rozestupu.</p>
        <p><b>Strom / solitéra</b> — jedním kliknutím. Tenká kružnice je koruna ve skutečném průměru.</p>
      </>
    ),
  },
  {
    cislo: 6, nazev: 'Kóty, tisk a výkaz', nastroje: ['kota', 'vyber'], zobrazeni: 'rostliny',
    hotovo: () => false,
    navod: (
      <>
        <p><b>Kóta</b> — dvěma kliky okótuješ vzdálenost.</p>
        <p>Vpravo v záložce <b>Výkaz</b> je soupis rostlin s počty ke stažení do CSV pro objednávku.</p>
        <p>Tlačítkem <b>Tisk / PDF</b> nahoře vytiskneš plán v přesném měřítku a na druhý list výkaz.</p>
      </>
    ),
  },
];

export default function Kroky() {
  const { pr, nastroj, urovenStetec, aktivniKod, db } = useStore();
  const st = useStore;
  const krok = pr.krok || 1;
  const akt = KROKY.find((k) => k.cislo === krok) ?? KROKY[0];
  const podkladInput = useRef<HTMLInputElement>(null);
  const [meritko, setMeritko] = useState(pr.podklad?.meritko ?? 100);
  const [nacita, setNacita] = useState(false);

  // krok urcuje vychozi nastroj i to, cim se zahony vybarvuji
  useEffect(() => {
    st.getState().set('zobrazeni', akt.zobrazeni);
    st.getState().set('nastroj', akt.nastroje[0]);
    st.getState().set('koncept', []);
  }, [krok, akt.zobrazeni, akt.nastroje, st]);

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
        z: Math.max(2, (window.innerWidth - 700) / podklad.sirkaM),
      });
    } catch (e) {
      alert('Podklad se nepodařilo načíst: ' + (e as Error).message);
    } finally { setNacita(false); }
  };

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-gray-300 bg-gray-50">
      <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Postup
      </div>

      {/* seznam kroku */}
      <div className="border-b border-gray-200">
        {KROKY.map((k) => {
          const hotovo = k.hotovo(useStore.getState());
          const je = k.cislo === krok;
          return (
            <button key={k.cislo} onClick={() => st.getState().zmen((d) => { d.krok = k.cislo; })}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${je ? 'bg-emerald-600 text-white' : 'hover:bg-gray-100'}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold
                ${je ? 'bg-white text-emerald-700' : hotovo ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                {hotovo && !je ? '✓' : k.cislo}
              </span>
              {k.nazev}
            </button>
          );
        })}
      </div>

      {/* navod k aktualnimu kroku */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="space-y-2 text-[13px] leading-snug text-gray-700 [&_b]:font-semibold">{akt.navod}</div>

        {/* nastroje kroku */}
        <div className="mt-4 space-y-1">
          {akt.nastroje.map((n) => (
            <button key={n} onClick={() => { st.getState().set('nastroj', n); st.getState().set('koncept', []); }}
              className={`w-full rounded border px-2 py-1.5 text-left text-sm ${nastroj === n
                ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white hover:bg-gray-100'}`}>
              <span className="font-medium">{NASTROJE[n].nazev}</span>
              <span className={`block text-[11px] ${nastroj === n ? 'text-emerald-50' : 'text-gray-500'}`}>{NASTROJE[n].popis}</span>
            </button>
          ))}
        </div>

        {/* ovladani k jednotlivym krokum */}
        {krok === 1 && (
          <div className="mt-4 space-y-2 rounded border border-gray-200 bg-white p-2 text-sm">
            <label className="flex items-center justify-between">
              měřítko podkladu 1:
              <input type="number" value={meritko} onChange={(e) => setMeritko(+e.target.value || 100)}
                className="w-20 rounded border px-1 py-0.5" />
            </label>
            <button onClick={() => podkladInput.current?.click()} disabled={nacita}
              className="w-full rounded bg-emerald-600 px-2 py-1.5 text-white disabled:opacity-50">
              {nacita ? 'Načítám…' : pr.podklad ? 'Nahradit podklad' : 'Vybrat PDF nebo obrázek'}
            </button>
            <input ref={podkladInput} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) vlozPodklad(f); e.target.value = ''; }} />
            {pr.podklad && (
              <>
                <div className="text-xs text-gray-600">
                  {pr.podklad.nazev}<br />
                  {pr.podklad.sirkaM.toFixed(1)} × {pr.podklad.vyskaM.toFixed(1)} m
                </div>
                <label className="block text-xs text-gray-600">
                  krytí podkladu
                  <input type="range" min={0.1} max={1} step={0.05} value={pr.podklad.kryti} className="w-full"
                    onChange={(e) => st.getState().zmen((d) => { if (d.podklad) d.podklad.kryti = +e.target.value; })} />
                </label>
              </>
            )}
          </div>
        )}

        {krok === 3 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs text-gray-500">Přiřazovaná výška</div>
            {(Object.keys(UROVNE) as Uroven[]).map((u) => (
              <button key={u} onClick={() => { st.getState().set('urovenStetec', u); st.getState().set('nastroj', 'uroven'); }}
                className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm
                  ${urovenStetec === u ? 'border-gray-800' : 'border-gray-300 bg-white'}`}
                style={urovenStetec === u ? { background: UROVNE[u].barva + '55' } : undefined}>
                <span className="h-4 w-4 rounded" style={{ background: UROVNE[u].barva }} />
                <span>
                  {UROVNE[u].nazev}
                  <span className="block text-[11px] text-gray-500">
                    {UROVNE[u].od}–{UROVNE[u].do === 99 ? '∞' : UROVNE[u].do} m
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {krok === 5 && (
          <div className="mt-3 rounded border border-gray-200 bg-white p-2 text-xs">
            {aktivniKod
              ? <>kreslí se: <b className="italic">{db.find((r) => r.kod === aktivniKod)?.latin}</b></>
              : <span className="text-red-600">Nejdřív klikni na rostlinu v katalogu vpravo.</span>}
          </div>
        )}

        {krok === 6 && (
          <button onClick={() => window.open('/tisk', '_blank')}
            className="mt-3 w-full rounded bg-emerald-600 px-2 py-1.5 text-sm text-white">Otevřít tisk</button>
        )}
      </div>

      <div className="border-t border-gray-200 p-2">
        <div className="flex gap-2">
          <button disabled={krok <= 1} onClick={() => st.getState().zmen((d) => { d.krok = krok - 1; })}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40">← Zpět</button>
          <button disabled={krok >= KROKY.length} onClick={() => st.getState().zmen((d) => { d.krok = krok + 1; })}
            className="flex-1 rounded bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-40">Další krok →</button>
        </div>
      </div>
    </div>
  );
}
