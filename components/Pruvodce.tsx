'use client';
import React, { useRef, useState } from 'react';
import Katalog from '@/components/Katalog';
import { dist as vzdalenost } from '@/lib/geom';
import {
  KATEGORIE_KROKU, Rostlina, UROVNE, Uroven, Zahon, otiskZahonu, urovenRostliny, vykaz,
} from '@/lib/model';
import { KROKY, Krok, POSLEDNI_KROK, useStore } from '@/lib/store';
import { useRozvrhy } from '@/lib/useRozvrhy';
import { nactiPodklad } from '@/lib/podklad';
import { smaz } from '@/lib/idb';

/** Jedna veta, co se ma prave ted delat. Nic jineho na obrazovce nesviti. */
const POKYN: Record<Krok, string> = {
  1: 'Nahraj plánek zahrady a řekni, v jakém je měřítku. Přepínačem Metrová síť si ověříš, že sedí.',
  2: 'Obkresli po plánku okraj záhonu. Klikáním, Enter nebo tlačítkem uzavřeš.',
  3: 'Zvýrazňovačem přejeď zhruba tam, kde chceš nízké a kde vysoké rostliny. Je to jen pomůcka — do výkresu se nekreslí a klidně může přesahovat.',
  4: 'Vpravo klikáním vybírej rostliny. Trvalky se rozmístí do záhonu samy, keře a stromy nakreslíš do plánu.',
  5: 'Hotovo. Přepínači si zapni, co má být na výkrese vidět, a vytiskni.',
};

export default function Pruvodce() {
  const pr = useStore((s) => s.pr);
  const krok = pr.krok as Krok;

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-lg bg-white/95 px-3 py-2 shadow-md ring-1 ring-black/5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Krok {krok} z {POSLEDNI_KROK} · {KROKY[krok - 1].nazev}
        </div>
        <div className="text-sm text-gray-700">{POKYN[krok]}</div>
      </div>

      <Zoom />

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-5xl items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5">
          <Navigace />
        </div>
      </div>
    </>
  );
}

/** Posun a priblizeni - vzdycky po ruce, v kazdem kroku. */
function Zoom() {
  const kamera = useStore((s) => s.kamera);
  const st = useStore;
  const zmen = (k: number) => st.getState().setKamera({ z: Math.max(2, Math.min(600, kamera.z * k)) });

  return (
    <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black/5">
      <button onClick={() => zmen(1.3)} title="Přiblížit" className="px-2.5 py-1.5 text-lg leading-none hover:bg-gray-100">+</button>
      <button onClick={() => zmen(1 / 1.3)} title="Oddálit" className="border-t border-gray-200 px-2.5 py-1.5 text-lg leading-none hover:bg-gray-100">−</button>
      <button onClick={() => window.dispatchEvent(new CustomEvent('plan:naObrazovku'))} title="Vejít celý plán"
        className="border-t border-gray-200 px-2 py-1.5 text-[11px] hover:bg-gray-100">celý</button>
    </div>
  );
}

function Navigace() {
  const { pr } = useStore();
  const st = useStore;
  const krok = pr.krok as Krok;
  const jdi = (k: number) => st.getState().naKrok(Math.max(1, Math.min(POSLEDNI_KROK, k)) as Krok);

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
      <button onClick={() => jdi(krok + 1)} disabled={krok === POSLEDNI_KROK}
        className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-30">
        Další →
      </button>
    </>
  );
}

/** Akce, ktere davaji smysl jen v danem kroku. */
function KrokAkce() {
  const {
    pr, aktivniZahon, aktivniKod, db, urovenStetec, upravovat, prichytavat, meri, koncept, kamera,
  } = useStore();
  const st = useStore;
  const krok = pr.krok as Krok;
  const podkladInput = useRef<HTMLInputElement>(null);
  const [meritko, setMeritko] = useState(pr.podklad?.meritko ?? 100);
  const [nacita, setNacita] = useState(false);
  const zahon = pr.zahony.find((z) => z.id === aktivniZahon) ?? pr.zahony[0];
  const aktivni = db.find((r) => r.kod === aktivniKod);

  /**
   * Prepocet meritka podkladu. Meni se i uz nakreslena geometrie, aby plan
   * zustal vuci podkladu na miste.
   */
  const kalibruj = (pomer: number) => {
    if (!(pomer > 0) || Math.abs(pomer - 1) < 1e-6) return;
    const skaluj = (b: { x: number; y: number }) => { b.x *= pomer; b.y *= pomer; };
    st.getState().zmen((d) => {
      if (d.podklad) {
        d.podklad.sirkaM *= pomer; d.podklad.vyskaM *= pomer;
        d.podklad.x *= pomer; d.podklad.y *= pomer;
        if (d.podklad.meritko) d.podklad.meritko *= pomer;
      }
      for (const z of d.zahony) {
        z.obrys.forEach(skaluj);
        z.vysky.forEach((v) => v.body.forEach(skaluj));
      }
      d.skupiny.forEach((s) => s.body.forEach(skaluj));
      d.solitery.forEach((s) => skaluj(s.pos));
    });
    st.getState().setKamera({ x: kamera.x * pomer, y: kamera.y * pomer, z: kamera.z / pomer });
    st.getState().set('koncept', []);
    setMeritko(Math.round(st.getState().pr.podklad?.meritko ?? 100));
  };

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
    const namereno = koncept.length >= 2 ? vzdalenost(koncept[0], koncept[1]) : 0;
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
          <>
            <label className="flex items-center gap-1 text-xs text-gray-500">
              krytí
              <input type="range" min={0.1} max={1} step={0.05} value={pr.podklad.kryti} className="w-20"
                onChange={(e) => st.getState().zmen((d) => { if (d.podklad) d.podklad.kryti = +e.target.value; })} />
            </label>
            <Prepinac zapnuto={pr.ukazSit} onClick={() => st.getState().zmen((d) => { d.ukazSit = !d.ukazSit; })}>
              Metrová síť
            </Prepinac>
            <Prepinac zapnuto={meri} onClick={() => { st.getState().set('meri', !meri); st.getState().set('koncept', []); }}>
              Změřit
            </Prepinac>
            {meri && (namereno > 0 ? (
              <span className="flex items-center gap-1 rounded-lg bg-pink-50 px-2 py-1 text-sm">
                <b>{namereno.toFixed(2)} m</b>
                <span className="text-gray-500">· má být</span>
                <input type="number" step="0.01" placeholder="m" className="w-20 rounded border px-1 py-0.5"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const skutecna = parseFloat((e.target as HTMLInputElement).value.replace(',', '.'));
                    if (skutecna > 0) kalibruj(skutecna / namereno);
                  }} />
                <span className="text-[11px] text-gray-400">Enter</span>
              </span>
            ) : <span className="text-xs text-gray-500">klikni dva body na plánku</span>)}
          </>
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
        <Prepinac zapnuto={prichytavat} onClick={() => st.getState().set('prichytavat', !prichytavat)}>Přichytávat</Prepinac>
        {!upravovat && koncept.length >= 3 && (
          <button onClick={() => window.dispatchEvent(new CustomEvent('plan:dokoncit'))}
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

  if (krok === 4) {
    const kresliRadu = aktivni && (KATEGORIE_KROKU.kere as readonly string[]).includes(aktivni.kat);
    return (
      <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
        {aktivni
          ? <span className="text-sm text-gray-600">kreslí se <b className="italic">{aktivni.latin}</b></span>
          : <span className="text-sm text-gray-500">vyber rostlinu vpravo</span>}
        {kresliRadu && koncept.length >= 2 && (
          <button onClick={() => window.dispatchEvent(new CustomEvent('plan:dokoncit'))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white">Dokončit řadu</button>
        )}
        {koncept.length > 0 && (
          <button onClick={() => st.getState().set('koncept', [])}
            className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100">Zrušit</button>
        )}
        <Prepinac zapnuto={pr.ukazVysky} onClick={() => st.getState().zmen((d) => { d.ukazVysky = !d.ukazVysky; })}>
          Výškové oblasti
        </Prepinac>
      </div>
    );
  }

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

function Prepinac({ zapnuto, onClick, children }: { zapnuto: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-sm ${zapnuto ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
      {children}
    </button>
  );
}

// ============================================================ bocni panel

export function BocniPanel() {
  const krok = useStore((s) => s.pr.krok);
  if (krok === 4) return <PanelRostlin />;
  if (krok === POSLEDNI_KROK) return <PanelVykazu />;
  return null;
}

const OBAL = 'flex h-full w-[350px] shrink-0 flex-col border-l border-gray-200 bg-white';

/** Krok 4 - vsechen rostlinny material na jednom miste. */
function PanelRostlin() {
  const {
    pr, db, aktivniZahon, aktivniKod, sortiment, vybranaSkupina, vybranaTecka, vybranaBublina,
    rozestupNovy,
  } = useStore();
  const st = useStore;
  const rozvrhy = useRozvrhy();
  const zahon = pr.zahony.find((z) => z.id === aktivniZahon) ?? pr.zahony[0];
  const rozvrh = zahon ? rozvrhy.get(zahon.id) : undefined;
  const skupina = pr.skupiny.find((s) => s.id === vybranaSkupina);
  const tecka = vybranaTecka;
  const bublina = vybranaBublina;
  const teckaKod = tecka
    ? pr.skupiny.find((s) => s.id === tecka.skupina)?.tecky?.[tecka.index]?.kod
    : undefined;
  const bublinaObj = bublina
    ? pr.zahony.find((z) => z.id === bublina.zahon)?.bubliny?.[bublina.index]
    : undefined;

  const uprav = (fn: (z: Zahon) => void) => {
    if (!zahon) return;
    st.getState().zmen((d) => { const x = d.zahony.find((y) => y.id === zahon.id); if (x) fn(x); });
  };

  /** Klik v seznamu. Kdyz je neco vybrane, meni se to; jinak se pridava. */
  const vyber = (r: Rostlina) => {
    const jeKer = (KATEGORIE_KROKU.kere as readonly string[]).includes(r.kat);
    const jeTrvalka = (KATEGORIE_KROKU.zahon as readonly string[]).includes(r.kat);

    // jeden ker v rade
    if (tecka && jeKer) {
      st.getState().zmen((d) => {
        const s = d.skupiny.find((x) => x.id === tecka.skupina);
        if (s?.tecky?.[tecka.index]) s.tecky[tecka.index].kod = r.kod;
      });
      return;
    }
    // cela rada
    if (skupina && jeKer) {
      st.getState().zmen((d) => {
        const s = d.skupiny.find((x) => x.id === skupina.id);
        if (!s) return;
        s.kod = r.kod;
        s.tecky?.forEach((t) => { t.kod = r.kod; });
      });
      return;
    }
    // jedna bublina trvalek
    if (bublina && jeTrvalka) {
      st.getState().zmen((d) => {
        const z = d.zahony.find((x) => x.id === bublina.zahon);
        const b = z?.bubliny?.[bublina.index];
        if (!b || !z) return;
        b.kod = r.kod;
        // aby se rozvrzeni nezahodilo, otisk se posune na novy stav
        if (!z.osazeni.some((o) => o.kod === r.kod)) z.osazeni.push({ kod: r.kod, podil: 1 });
        z.otisk = otiskZahonu(z);
      });
      return;
    }

    if (jeTrvalka) {
      if (!zahon) { alert('Nejdřív nakresli záhon (krok 2).'); return; }
      uprav((z) => {
        const i = z.osazeni.findIndex((o) => o.kod === r.kod);
        if (i >= 0) z.osazeni.splice(i, 1);
        else z.osazeni.push({ kod: r.kod, podil: 1 });
      });
      return;
    }
    st.getState().set('aktivniKod', r.kod);
    st.getState().set('rozestupNovy', null);
  };

  /** Zvetsi nebo zmensi vybranou bublinu na ukor sousedu. */
  const zmenVelikost = (o: number) => {
    if (!bublina) return;
    st.getState().zmen((d) => {
      const z = d.zahony.find((x) => x.id === bublina.zahon);
      const b = z?.bubliny?.[bublina.index];
      if (!b || !z) return;
      b.vaha += o;
      z.otisk = otiskZahonu(z);
    });
  };

  const soucet = zahon?.osazeni.reduce((a, x) => a + Math.max(0.01, x.podil), 0) || 1;
  const vybraneKody = [
    ...(zahon?.osazeni.map((o) => o.kod) ?? []),
    ...(aktivniKod ? [aktivniKod] : []),
  ];

  const rostlinaSkupiny = db.find((r) => r.kod === skupina?.kod);
  const aktivni = db.find((r) => r.kod === aktivniKod);
  const rozestup = skupina
    ? (skupina.rozestup ?? rostlinaSkupiny?.rozestup ?? 1.2)
    : (rozestupNovy ?? aktivni?.rozestup ?? 1.2);

  return (
    <div className={OBAL}>
      {/* co uz je v zahonu */}
      {zahon && (
        <div className="max-h-[45%] overflow-auto border-b border-gray-200 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">{zahon.nazev}</span>
            <span className="text-xs text-gray-500">{rozvrh?.plocha.toFixed(1)} m²</span>
          </div>
          {pr.zahony.length > 1 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {pr.zahony.map((z) => (
                <button key={z.id} onClick={() => st.getState().set('aktivniZahon', z.id)}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${z.id === zahon.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {z.nazev}
                </button>
              ))}
            </div>
          )}

          {!zahon.osazeni.length && (
            <p className="py-2 text-xs text-gray-500">Zatím prázdný — klikni na trvalku v seznamu dole.</p>
          )}

          {zahon.osazeni.map((o) => {
            const r = db.find((x) => x.kod === o.kod);
            const kusu = (rozvrh?.casti ?? []).filter((c) => c.kod === o.kod).reduce((a, c) => a + c.kusu, 0);
            const u = r ? urovenRostliny(r.vyska) : null;
            return (
              <div key={o.kod} className="mb-1 rounded border border-gray-200 px-2 py-1">
                <div className="flex items-center gap-2">
                  {u && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: UROVNE[u].barva }} />}
                  <span className="text-[11px] font-bold">{o.kod}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] italic">{r?.latin}</span>
                  <span className="text-[11px] text-gray-500">{kusu} ks</span>
                  <button onClick={() => uprav((z) => { z.osazeni = z.osazeni.filter((x) => x.kod !== o.kod); })}
                    className="text-gray-400 hover:text-red-600">×</button>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <input type="range" min={0.2} max={5} step={0.1} value={o.podil} className="flex-1"
                    onChange={(e) => uprav((z) => {
                      const x = z.osazeni.find((y) => y.kod === o.kod);
                      if (x) x.podil = +e.target.value;
                    })} />
                  <span className="w-9 text-right text-[11px] text-gray-500">
                    {Math.round((Math.max(0.01, o.podil) / soucet) * 100)} %
                  </span>
                  <span className="text-[11px] text-gray-400">skupin</span>
                  {([undefined, 1, 2, 3, 4] as (number | undefined)[]).map((n) => (
                    <button key={n ?? 'auto'} onClick={() => uprav((z) => {
                      const x = z.osazeni.find((y) => y.kod === o.kod);
                      if (x) x.skupin = n;
                    })}
                      className={`rounded px-1 text-[11px] ${o.skupin === n ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                      {n ?? 'a'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {zahon.osazeni.length > 0 && (
            <button onClick={() => uprav((z) => { z.semeno = Math.floor(Math.random() * 100000); })}
              className="mt-1 w-full rounded border border-gray-300 py-1 text-xs hover:bg-gray-50">
              Přeházet rozmístění
            </button>
          )}
        </div>
      )}

      {/* co je prave vybrane a co s tim jde delat */}
      {(tecka || bublina) && (
        <div className="border-b border-emerald-300 bg-emerald-50 px-3 py-2 text-xs">
          {tecka && (
            <>
              <div className="font-medium">Vybraný jeden keř</div>
              <div className="mt-0.5 italic">{db.find((r) => r.kod === teckaKod)?.latin ?? teckaKod}</div>
              <p className="mt-1 text-[11px] text-gray-600">
                Klikni na keř v seznamu — změní se jen tenhle kus, ne celá řada.
              </p>
            </>
          )}
          {bublina && (
            <>
              <div className="font-medium">Vybraná bublina</div>
              <div className="mt-0.5 italic">{db.find((r) => r.kod === bublinaObj?.kod)?.latin ?? bublinaObj?.kod}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-gray-600">velikost</span>
                <button onClick={() => zmenVelikost(-0.35)} className="rounded border border-gray-300 bg-white px-2 py-0.5">−</button>
                <button onClick={() => zmenVelikost(0.35)} className="rounded border border-gray-300 bg-white px-2 py-0.5">+</button>
                <span className="text-[11px] text-gray-500">
                  {(rozvrh?.casti.find((c) => c.bublina === bublina.index)?.plocha ?? 0).toFixed(1)} m²
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-600">
                Klikni na trvalku v seznamu, změní se jen tahle bublina. Hranice posuneš tažením
                zeleného bodu uprostřed.
              </p>
            </>
          )}
          <button onClick={() => { st.getState().set('vybranaTecka', null); st.getState().set('vybranaBublina', null); }}
            className="mt-1 text-[11px] text-gray-500 underline">zrušit výběr</button>
        </div>
      )}

      {/* rozestup rady keru */}
      {(sortiment === 'kere' || skupina) && !tecka && (
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">
              {skupina ? <>rozestup vybrané řady <i>{rostlinaSkupiny?.latin}</i></> : 'rozestup nové řady'}
            </span>
            <input type="number" step="0.1" min={0.2} value={rozestup} className="w-16 rounded border px-1 py-0.5"
              onChange={(e) => {
                const v = +e.target.value;
                if (!(v > 0.1)) return;
                if (skupina) st.getState().zmen((d) => { const x = d.skupiny.find((s) => s.id === skupina.id); if (x) x.rozestup = v; });
                else st.getState().set('rozestupNovy', v);
              }} />
            <span className="text-gray-500">m</span>
            {skupina && (
              <button onClick={() => st.getState().set('vybranaSkupina', null)}
                className="ml-auto text-gray-500 underline">zrušit výběr</button>
            )}
          </div>
          {skupina && <p className="mt-0.5 text-[11px] text-gray-500">Klikem na keř v seznamu změníš druh celé řady.</p>}
        </div>
      )}

      <Katalog vybrane={vybraneKody} onVyber={vyber} />

      <div className="border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500">
        {pr.skupiny.length}× řada keřů · {pr.solitery.length}× strom
      </div>
    </div>
  );
}

/** Posledni krok - vykaz rostlin. */
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

