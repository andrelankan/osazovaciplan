'use client';
import React, { useMemo, useState } from 'react';
import { delkaHrany, dist, naBody, sub, norm, mul, add } from '@/lib/geom';
import { Ploska, Rostlina, UROVNE, Uroven, plochaPlosky, pocetKusu, sedneVyska, vykaz } from '@/lib/model';
import { useStore } from '@/lib/store';

const KAT_POradi = ['T', 'G', 'F', 'C', 'K', 'S', 'J', 'U'] as const;

export default function Panel() {
  const zalozka = useStore((s) => s.zalozka);
  const vyber = useStore((s) => s.vyber);
  const setZalozka = (z: 'katalog' | 'vlastnosti' | 'vykaz') => useStore.getState().set('zalozka', z);

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-gray-300 bg-gray-50">
      <div className="flex border-b border-gray-300 text-sm">
        {([['katalog', 'Katalog'], ['vlastnosti', 'Vlastnosti'], ['vykaz', 'Výkaz']] as const).map(([k, n]) => (
          <button key={k} onClick={() => setZalozka(k)}
            className={`flex-1 px-3 py-2 ${zalozka === k ? 'border-b-2 border-emerald-600 bg-white font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
            {n}{k === 'vlastnosti' && vyber ? ' •' : ''}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {zalozka === 'katalog' && <Katalog />}
        {zalozka === 'vlastnosti' && <Vlastnosti />}
        {zalozka === 'vykaz' && <Vykaz />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ katalog
function Katalog() {
  const { db, kategorie, aktivniKod, vyber, pr } = useStore();
  const st = useStore;
  const [hledej, setHledej] = useState('');
  const [kat, setKat] = useState<string>('');
  const [svetlo, setSvetlo] = useState<string>('');
  const [mesic, setMesic] = useState<number>(0);

  /** Vyskova oblast vybrane casti zahonu - podle ni se radi nabidka. */
  const cilovaVyska = useMemo(() => {
    if (vyber?.typ !== 'ploska') return null;
    const pl = pr.zahony.find((z) => z.id === vyber.zahon)?.plosky.find((p) => p.id === vyber.ploska);
    return pl?.uroven ?? null;
  }, [vyber, pr]);

  const seznam = useMemo(() => {
    const q = hledej.trim().toLowerCase();
    let v = db.filter((r) => {
      if (kat && r.kat !== kat) return false;
      if (svetlo && !r.svetlo.includes(svetlo)) return false;
      if (mesic && !r.mesice.includes(mesic)) return false;
      if (q && !(`${r.kod} ${r.latin} ${r.cesky}`.toLowerCase().includes(q))) return false;
      return true;
    });
    if (cilovaVyska) {
      const u = UROVNE[cilovaVyska];
      const stred = (u.od + Math.min(u.do, 2)) / 2;
      v = [...v].sort((a, b) => {
        const d = Number(!sedneVyska(a, cilovaVyska)) - Number(!sedneVyska(b, cilovaVyska));
        return d || Math.abs(a.vyska - stred) - Math.abs(b.vyska - stred);
      });
    }
    return v;
  }, [db, hledej, kat, svetlo, mesic, cilovaVyska]);

  const pouzij = (r: Rostlina) => {
    st.getState().set('aktivniKod', r.kod);
    const v = st.getState().vyber;
    if (v?.typ === 'ploska') {
      st.getState().zmen((d) => {
        const pl = d.zahony.find((z) => z.id === v.zahon)?.plosky.find((p) => p.id === v.ploska);
        if (pl) { pl.kod = r.kod; pl.pocet = undefined; }
      });
    } else if (v?.typ === 'skupina') {
      st.getState().zmen((d) => { const s = d.skupiny.find((x) => x.id === v.id); if (s) { s.kod = r.kod; s.rozestup = r.rozestup; } });
    } else if (v?.typ === 'solitera') {
      st.getState().zmen((d) => { const s = d.solitery.find((x) => x.id === v.id); if (s) { s.kod = r.kod; s.koruna = r.koruna; } });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-gray-200 bg-white p-2">
        <input value={hledej} onChange={(e) => setHledej(e.target.value)} placeholder="Hledat kód, latinský nebo český název…"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-1">
          <Chip aktivni={!kat} onClick={() => setKat('')}>vše</Chip>
          {KAT_POradi.map((k) => kategorie[k] && (
            <Chip key={k} aktivni={kat === k} onClick={() => setKat(kat === k ? '' : k)}
              barva={kategorie[k].fill}>{kategorie[k].nazev}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <select value={svetlo} onChange={(e) => setSvetlo(e.target.value)} className="rounded border px-1 py-1">
            <option value="">stanoviště: vše</option>
            <option value="slunce">slunce</option>
            <option value="polostín">polostín</option>
            <option value="stín">stín</option>
          </select>
          <select value={mesic} onChange={(e) => setMesic(+e.target.value)} className="rounded border px-1 py-1">
            <option value={0}>kvete: kdykoli</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>kvete v {i + 1}. měsíci</option>)}
          </select>
          <span className="ml-auto text-gray-500">{seznam.length}</span>
        </div>
        {cilovaVyska && (
          <div className="rounded px-2 py-1 text-xs" style={{ background: UROVNE[cilovaVyska].barva + '33' }}>
            Vybraná část záhonu je <b>{UROVNE[cilovaVyska].nazev}</b> ({UROVNE[cilovaVyska].od}–
            {UROVNE[cilovaVyska].do === 99 ? '∞' : UROVNE[cilovaVyska].do} m) — nahoře jsou rostliny odpovídající výšky.
          </div>
        )}
        {vyber?.typ !== 'ploska' && (
          <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Nemáš vybranou plochu — kliknutím se rostlina jen nastaví pro kreslení keřů a stromů.
            Do záhonu ji dostaneš tak, že nejdřív klikneš na plošku v plánu.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {seznam.map((r) => (
          <button key={r.kod} onClick={() => pouzij(r)}
            className={`flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left hover:bg-emerald-50 ${aktivniKod === r.kod ? 'bg-emerald-100' : 'bg-white'} ${cilovaVyska && !sedneVyska(r, cilovaVyska) ? 'opacity-45' : ''}`}>
            <span className="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold"
              style={{ background: kategorie[r.kat]?.fill, color: '#333' }}>{r.kod}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] italic">{r.latin}</span>
              <span className="block truncate text-[11px] text-gray-500">
                {r.cesky} · {r.vyska} m · {r.kvet || 'nekvete'} · {r.hustota} ks/m²
              </span>
            </span>
            {r.barva && <span className="h-4 w-4 shrink-0 rounded-full border border-gray-300" style={{ background: r.barva }} />}
          </button>
        ))}
        {!seznam.length && <p className="p-4 text-sm text-gray-500">Nic neodpovídá filtru.</p>}
      </div>
    </div>
  );
}

function Chip({ children, aktivni, onClick, barva }: { children: React.ReactNode; aktivni: boolean; onClick: () => void; barva?: string }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${aktivni ? 'border-emerald-600 font-medium' : 'border-gray-300 text-gray-600'}`}
      style={aktivni && barva ? { background: barva } : undefined}>{children}</button>
  );
}

// --------------------------------------------------------------- vlastnosti
function Vlastnosti() {
  const { pr, db, vyber } = useStore();
  const st = useStore;
  const r = (kod?: string) => db.find((x) => x.kod === kod);

  if (!vyber) return <p className="p-4 text-sm text-gray-500">Vyber něco na plánu (nástroj Výběr).</p>;

  if (vyber.typ === 'ploska') {
    const zh = pr.zahony.find((z) => z.id === vyber.zahon);
    const pl = zh?.plosky.find((p) => p.id === vyber.ploska);
    if (!zh || !pl) return null;
    const rost = r(pl.kod);
    const plocha = plochaPlosky(pl);
    return (
      <div className="space-y-3 p-3 text-sm">
        <Radek popis="Záhon">
          <input value={zh.nazev} onChange={(e) => st.getState().zmen((d) => { const x = d.zahony.find((y) => y.id === zh.id); if (x) x.nazev = e.target.value; })}
            className="w-full rounded border px-2 py-1" />
        </Radek>
        <Radek popis="Výšková oblast">
          <div className="flex gap-1">
            {(Object.keys(UROVNE) as Uroven[]).map((u) => (
              <button key={u} onClick={() => st.getState().zmen((d) => {
                const x = d.zahony.find((y) => y.id === zh.id)?.plosky.find((y) => y.id === pl.id);
                if (x) x.uroven = x.uroven === u ? undefined : u;
              })}
                className={`flex-1 rounded border px-1 py-1 text-xs ${pl.uroven === u ? 'border-gray-800 font-medium' : 'border-gray-300 bg-white'}`}
                style={pl.uroven === u ? { background: UROVNE[u].barva + '55' } : undefined}>
                {UROVNE[u].kratce}
              </button>
            ))}
          </div>
        </Radek>
        <Radek popis="Rostlina">
          {rost
            ? <span className="italic">
              {rost.latin}
              {pl.uroven && !sedneVyska(rost, pl.uroven) && (
                <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-[11px] not-italic text-amber-900">
                  {rost.vyska} m — mimo rozsah oblasti
                </span>
              )}
            </span>
            : <span className="text-gray-400">— vyber v katalogu —</span>}
        </Radek>
        <div className="grid grid-cols-2 gap-2">
          <Pole popis="Plocha" hodnota={`${plocha.toFixed(2)} m²`} />
          <Pole popis="Hustota" hodnota={rost ? `${rost.hustota} ks/m²` : '—'} />
        </div>
        <Radek popis="Počet kusů">
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={pocetKusu(pl, rost)}
              onChange={(e) => st.getState().zmen((d) => {
                const x = d.zahony.find((y) => y.id === zh.id)?.plosky.find((y) => y.id === pl.id);
                if (x) x.pocet = Math.max(0, +e.target.value);
              })}
              className="w-24 rounded border px-2 py-1" />
            {pl.pocet != null
              ? <button onClick={() => st.getState().zmen((d) => {
                const x = d.zahony.find((y) => y.id === zh.id)?.plosky.find((y) => y.id === pl.id);
                if (x) x.pocet = undefined;
              })} className="text-xs text-emerald-700 underline">zpět na automatický</button>
              : <span className="text-xs text-gray-500">automaticky z plochy</span>}
          </div>
        </Radek>

        {rost && (
          <div className="rounded border border-gray-200 bg-white p-2 text-xs">
            <div className="mb-1 font-medium">{rost.cesky}</div>
            <div className="text-gray-600">
              výška {rost.vyska} m · kvete {rost.kvet || '—'} · {rost.svetlo.join(', ')}
              {rost.pozn && <> · {rost.pozn}</>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-gray-500">upravit hustotu</span>
              <input type="number" step="0.1" min={0.02} defaultValue={rost.hustota}
                onBlur={(e) => st.getState().upravRostlinu(rost.kod, { hustota: +e.target.value })}
                className="w-20 rounded border px-1 py-0.5" /> ks/m²
            </div>
          </div>
        )}

        <Hrany ploska={pl} zahonId={zh.id} />
        <Smazat />
      </div>
    );
  }

  if (vyber.typ === 'skupina') {
    const s = pr.skupiny.find((x) => x.id === vyber.id);
    if (!s) return null;
    const rost = r(s.kod);
    const body = naBody(s.body, 0.02, false);
    let delka = 0;
    for (let i = 1; i < body.length; i++) delka += dist(body[i - 1], body[i]);
    const rozestup = s.rozestup ?? rost?.rozestup ?? 1.2;
    const pocet = Math.max(2, Math.round(delka / rozestup) + 1);
    return (
      <div className="space-y-3 p-3 text-sm">
        <Radek popis="Skupina keřů"><span className="italic">{rost?.latin ?? s.kod}</span></Radek>
        <div className="grid grid-cols-2 gap-2">
          <Pole popis="Délka řady" hodnota={`${delka.toFixed(2)} m`} />
          <Pole popis="Počet keřů" hodnota={String(s.pocet ?? pocet)} />
        </div>
        <Radek popis="Rozestup">
          <input type="number" step="0.1" min={0.2} value={rozestup}
            onChange={(e) => st.getState().zmen((d) => { const x = d.skupiny.find((y) => y.id === s.id); if (x) { x.rozestup = +e.target.value; x.pocet = undefined; } })}
            className="w-24 rounded border px-2 py-1" /> <span className="text-xs text-gray-500">m</span>
        </Radek>
        <Smazat />
      </div>
    );
  }

  if (vyber.typ === 'solitera') {
    const s = pr.solitery.find((x) => x.id === vyber.id);
    if (!s) return null;
    const rost = r(s.kod);
    return (
      <div className="space-y-3 p-3 text-sm">
        <Radek popis="Solitéra"><span className="italic">{rost?.latin ?? s.kod}</span></Radek>
        <Radek popis="Průměr koruny">
          <input type="number" step="0.5" min={0.5} value={s.koruna ?? rost?.koruna ?? 4}
            onChange={(e) => st.getState().zmen((d) => { const x = d.solitery.find((y) => y.id === s.id); if (x) x.koruna = +e.target.value; })}
            className="w-24 rounded border px-2 py-1" /> <span className="text-xs text-gray-500">m</span>
        </Radek>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!s.vicekmen}
            onChange={(e) => st.getState().zmen((d) => { const x = d.solitery.find((y) => y.id === s.id); if (x) x.vicekmen = e.target.checked; })} />
          vícekmen (silnější kolečko)
        </label>
        <Smazat />
      </div>
    );
  }

  return null;
}

/** Tabulka hran s presnymi delkami a prohnutim. */
function Hrany({ ploska, zahonId }: { ploska: Ploska; zahonId: string }) {
  const st = useStore;
  const n = ploska.ring.length;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-600">Rozměry stran</div>
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr><th className="text-left font-normal">strana</th><th className="text-left font-normal">délka (m)</th><th className="text-left font-normal">prohnutí (m)</th></tr>
        </thead>
        <tbody>
          {ploska.ring.map((v, i) => {
            const b = ploska.ring[(i + 1) % n];
            const d = delkaHrany(v, b, v.b);
            const prohnuti = ((v.b ?? 0) * dist(v, b)) / 2;
            return (
              <tr key={i}>
                <td className="py-0.5 text-gray-500">{i + 1}</td>
                <td>
                  <input defaultValue={d.toFixed(2)} key={'d' + d.toFixed(3)}
                    onBlur={(e) => {
                      const nova = parseFloat(e.target.value.replace(',', '.'));
                      if (!(nova > 0)) return;
                      st.getState().zmen((dd) => {
                        const pl = dd.zahony.find((z) => z.id === zahonId)?.plosky.find((p) => p.id === ploska.id);
                        if (!pl) return;
                        const a = pl.ring[i], c = pl.ring[(i + 1) % n];
                        const smer = norm(sub(c, a));
                        const cil = add(a, mul(smer, nova));
                        c.x = cil.x; c.y = cil.y;
                      });
                    }}
                    className="w-20 rounded border px-1 py-0.5" />
                </td>
                <td>
                  <input defaultValue={prohnuti.toFixed(2)} key={'b' + prohnuti.toFixed(3)}
                    onBlur={(e) => {
                      const s = parseFloat(e.target.value.replace(',', '.')) || 0;
                      st.getState().zmen((dd) => {
                        const pl = dd.zahony.find((z) => z.id === zahonId)?.plosky.find((p) => p.id === ploska.id);
                        if (!pl) return;
                        const a = pl.ring[i], c = pl.ring[(i + 1) % n];
                        const dd2 = dist(a, c);
                        a.b = dd2 > 0 ? (2 * s) / dd2 : 0;
                      });
                    }}
                    className="w-20 rounded border px-1 py-0.5" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-gray-500">Prohnutí = vzdálenost oblouku od tětivy. 0 = rovná strana.</p>
    </div>
  );
}

function Smazat() {
  const st = useStore;
  return (
    <button onClick={() => {
      const v = st.getState().vyber;
      if (!v) return;
      st.getState().zmen((d) => {
        if (v.typ === 'ploska') {
          const zh = d.zahony.find((x) => x.id === v.zahon);
          if (!zh) return;
          zh.plosky = zh.plosky.filter((p) => p.id !== v.ploska);
          if (!zh.plosky.length) d.zahony = d.zahony.filter((x) => x.id !== zh.id);
        } else if (v.typ === 'skupina') d.skupiny = d.skupiny.filter((x) => x.id !== v.id);
        else if (v.typ === 'solitera') d.solitery = d.solitery.filter((x) => x.id !== v.id);
      });
      st.getState().set('vyber', null);
    }} className="w-full rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50">
      Smazat (Del)
    </button>
  );
}

const Radek = ({ popis, children }: { popis: string; children: React.ReactNode }) => (
  <div><div className="mb-0.5 text-xs text-gray-500">{popis}</div>{children}</div>
);
const Pole = ({ popis, hodnota }: { popis: string; hodnota: string }) => (
  <div className="rounded border border-gray-200 bg-white px-2 py-1">
    <div className="text-[11px] text-gray-500">{popis}</div><div className="font-medium">{hodnota}</div>
  </div>
);

// ------------------------------------------------------------------- vykaz
function Vykaz() {
  const { pr, db, kategorie } = useStore();
  const radky = useMemo(() => vykaz(pr, db), [pr, db]);
  const celkem = radky.reduce((a, r) => a + r.kusu, 0);

  const csv = () => {
    const hlavicka = ['Kód', 'Latinský název', 'Český název', 'Kategorie', 'Ks', 'Plocha m2', 'Umístění'];
    const telo = radky.map((r) => [
      r.kod, r.rostlina?.latin ?? '', r.rostlina?.cesky ?? '', r.rostlina?.kategorie ?? '',
      String(r.kusu), r.plocha ? r.plocha.toFixed(2) : '', r.kde,
    ]);
    const txt = '﻿' + [hlavicka, ...telo].map((r) => r.map((b) => `"${b.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `vykaz-rostlin-${pr.nazev.replace(/\W+/g, '-').toLowerCase()}.csv`;
    a.click();
  };

  return (
    <div className="p-2 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-gray-600">{radky.length} položek · {celkem} ks</span>
        <button onClick={csv} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100">
          Stáhnout CSV
        </button>
      </div>
      <table className="w-full text-xs">
        <thead className="border-b border-gray-300 text-gray-500">
          <tr><th className="text-left font-normal">kód</th><th className="text-left font-normal">rostlina</th>
            <th className="text-right font-normal">ks</th><th className="text-right font-normal">m²</th></tr>
        </thead>
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
              <td className="text-right text-gray-500">{r.plocha ? r.plocha.toFixed(1) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!radky.length && <p className="p-4 text-gray-500">Zatím nic nevysazeno.</p>}
    </div>
  );
}
