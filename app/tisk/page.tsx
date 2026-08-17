'use client';
import { useEffect, useMemo, useState } from 'react';
import { P, cesta, cestaBody, delkaHrany, lerp, naBody, obalka } from '@/lib/geom';
import { teckySkupiny } from '@/components/Plan';
import { Databaze, KatInfo, Projekt, Rostlina, ZNACKA, vykaz } from '@/lib/model';
import { Rozvrh } from '@/lib/rozvrh';
import { rozvrhyProjektu } from '@/lib/useRozvrhy';
import { nactiUlozeny } from '@/lib/store';
import { nacti } from '@/lib/idb';

const PAPIRY: Record<string, { w: number; h: number }> = {
  A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 }, A2: { w: 594, h: 420 }, A1: { w: 841, h: 594 },
};
const MERITKA = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];
const OKRAJ = 10;
const LEGENDA_W = 56;
const PATA_H = 12;

export default function Tisk() {
  const [pr, setPr] = useState<Projekt | null>(null);
  const [db, setDb] = useState<Rostlina[]>([]);
  const [kat, setKat] = useState<Record<string, KatInfo>>({});
  const [podklad, setPodklad] = useState<string | null>(null);
  const [papir, setPapir] = useState('A3');
  const [meritko, setMeritko] = useState(100);
  const [sLegendou, setSLegendou] = useState(true);
  const [sPodkladem, setSPodkladem] = useState(true);

  // plan lezi v localStorage, ten je dostupny az v prohlizeci - nacteni patri do efektu
  useEffect(() => {
    const p = nactiUlozeny();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPr(p);
    if (p) setMeritko(p.meritkoTisk || 100);
    fetch('/data/plants.json').then((r) => r.json()).then((d: Databaze) => { setDb(d.rostliny); setKat(d.kategorie); });
    if (p?.podklad) nacti(p.podklad.klic).then((v) => {
      if (v instanceof Blob) setPodklad(URL.createObjectURL(v));
      else if (typeof v === 'string') setPodklad(v);
    }).catch(() => { });
  }, []);

  const rozvrhy = useMemo<Map<string, Rozvrh>>(() => (pr ? rozvrhyProjektu(pr, db) : new Map()), [pr, db]);
  const casti = useMemo(() => (pr?.zahony ?? []).flatMap((z) =>
    (rozvrhy.get(z.id)?.casti ?? []).map((c) => ({ nazevZahonu: z.nazev, kod: c.kod, kusu: c.kusu, plocha: c.plocha }))),
    [pr, rozvrhy]);
  const radky = useMemo(() => (pr ? vykaz(pr, db, casti) : []), [pr, db, casti]);

  if (!pr) return <p className="p-8">Není co tisknout — nejdřív si v editoru rozkresli plán.</p>;

  const list = PAPIRY[papir];
  const legendaW = sLegendou && radky.length ? LEGENDA_W : 0;
  const kreslici = { w: list.w - 2 * OKRAJ - legendaW, h: list.h - 2 * OKRAJ - PATA_H };
  const mnm = meritko / 1000;                       // metru na milimetr papiru
  const svetW = kreslici.w * mnm, svetH = kreslici.h * mnm;

  const body: P[] = [];
  for (const z of pr.zahony) body.push(...naBody(z.obrys, 0.1));
  for (const s of pr.skupiny) body.push(...s.body);
  for (const s of pr.solitery) body.push(s.pos);
  const o = body.length ? obalka(body) : { x0: 0, y0: 0, x1: svetW, y1: svetH, w: svetW, h: svetH };
  const stredX = (o.x0 + o.x1) / 2, stredY = (o.y0 + o.y1) / 2;
  const vb = `${stredX - svetW / 2} ${stredY - svetH / 2} ${svetW} ${svetH}`;
  const sedi = o.w <= svetW && o.h <= svetH;
  const tl = mnm;                                   // 1 mm ve svetovych metrech

  /** Nejmensi bezne meritko, ve kterem se plan na list vejde. */
  const padne = () => {
    const potreba = Math.max(o.w / kreslici.w, o.h / kreslici.h) * 1000 * 1.04;
    setMeritko(MERITKA.find((m) => m >= potreba) ?? Math.ceil(potreba / 50) * 50);
  };

  const rost = (kod?: string) => db.find((r) => r.kod === kod);

  return (
    <>
      <style>{`@page { size: ${list.w}mm ${list.h}mm; margin: 0; }
        @media print { .bezTisku { display: none !important; } body { background: #fff; } }`}</style>

      <div className="bezTisku sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2 text-sm print:hidden">
        <b>Tisk plánu</b>
        <label>papír <select value={papir} onChange={(e) => setPapir(e.target.value)} className="rounded border px-1 py-0.5">
          {Object.keys(PAPIRY).map((k) => <option key={k}>{k}</option>)}
        </select></label>
        <label>měřítko 1: <input type="number" value={meritko} onChange={(e) => setMeritko(+e.target.value || 100)}
          className="w-20 rounded border px-1 py-0.5" /></label>
        <button onClick={padne} className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100">
          přizpůsobit listu
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sLegendou} onChange={(e) => setSLegendou(e.target.checked)} /> legenda
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sPodkladem} onChange={(e) => setSPodkladem(e.target.checked)} /> podklad
        </label>
        <span className={sedi ? 'text-emerald-700' : 'text-red-600'}>
          {sedi ? 'vejde se' : `plán je větší než list (${o.w.toFixed(1)} × ${o.h.toFixed(1)} m)`}
        </span>
        <button onClick={() => window.print()} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-white">Vytisknout</button>
      </div>

      {/* ------------------------------------------------------ list 1: plán */}
      <div style={{ width: `${list.w}mm`, height: `${list.h}mm` }} className="relative mx-auto bg-white shadow print:shadow-none">
        <svg width={`${kreslici.w}mm`} height={`${kreslici.h}mm`} viewBox={vb}
          style={{ position: 'absolute', left: `${OKRAJ}mm`, top: `${OKRAJ}mm` }}>
          {/* vybarveni ploch */}
          {pr.zahony.map((zh) => (
            <g key={zh.id}>
              <path d={cesta(zh.obrys)} fill="#eee" />
              {(rozvrhy.get(zh.id)?.casti ?? []).map((c) => (
                <path key={c.id} d={cestaBody(c.polygon)}
                  fill={rost(c.kod) ? kat[rost(c.kod)!.kat]?.fill ?? '#eee' : '#eee'} />
              ))}
            </g>
          ))}

          {/* podklad s rastrem nad vybarvenim */}
          {sPodkladem && pr.podklad && podklad && (
            <image href={podklad} x={pr.podklad.x} y={pr.podklad.y}
              width={pr.podklad.sirkaM} height={pr.podklad.vyskaM} opacity={pr.podklad.kryti} />
          )}

          {/* hranice ploch a obrysy záhonů */}
          {pr.zahony.map((zh) => (
            <g key={zh.id}>
              {(rozvrhy.get(zh.id)?.casti ?? []).map((c) => (
                <path key={c.id} d={cestaBody(c.polygon)} fill="none" stroke="#777" strokeWidth={0.15 * tl} />
              ))}
              <path d={cesta(zh.obrys)} fill="none" stroke="#111" strokeWidth={0.5 * tl} />
            </g>
          ))}

          {/* keře - spojené tečky o průměru 5 cm ve skutečném měřítku */}
          {pr.skupiny.map((s) => {
            const tecky = teckySkupiny(s, db);
            return (
              <g key={s.id}>
                {s.podrost === false && tecky.map((q, i) => (
                  <circle key={'k' + i} cx={q.x} cy={q.y} r={(rost(q.kod)?.koruna ?? 1.2) / 2}
                    fill="none" stroke="#999" strokeWidth={0.15 * tl} strokeDasharray={`${tl} ${0.7 * tl}`} />
                ))}
                {tecky.length > 1 && (
                  <polyline points={tecky.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#111" strokeWidth={0.25 * tl} />
                )}
                {tecky.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={ZNACKA.ker / 2} fill="#111" />)}
              </g>
            );
          })}

          {/* stromy - duté kolečko o průměru 10 cm */}
          {pr.solitery.map((s) => {
            const r = rost(s.kod);
            return (
              <g key={s.id}>
                <circle cx={s.pos.x} cy={s.pos.y} r={(s.koruna ?? r?.koruna ?? 4) / 2} fill="none" stroke="#111" strokeWidth={0.25 * tl} />
                <circle cx={s.pos.x} cy={s.pos.y} r={ZNACKA.strom / 2} fill="#fff" stroke="#111" strokeWidth={0.3 * tl} />
              </g>
            );
          })}

          {/* délky stran */}
          {pr.ukazDelky && pr.zahony.flatMap((zh) => zh.obrys.map((v, i) => {
            const b = zh.obrys[(i + 1) % zh.obrys.length];
            const d = delkaHrany(v, b, v.b);
            if (d < 0.3) return null;
            const c = lerp(v, b, 0.5);
            return (
              <text key={zh.id + i} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={2.2 * tl} fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke">
                {d.toFixed(2)}
              </text>
            );
          }))}

          {/* popisky nad vším */}
          {pr.zahony.map((zh) => (rozvrhy.get(zh.id)?.casti ?? []).map((c) => (
            <text key={c.id} x={c.popisek.x} y={c.popisek.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={2.6 * tl} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke">
              {c.kod}{c.kusu}{pr.ukazPlochy ? ` (${c.plocha.toFixed(1)} m²)` : ''}
            </text>
          )))}

          {/* nazev u kazde tecky, kolidujici popisky se vynechavaji */}
          {(() => {
            const obsazeno: { x0: number; y0: number; x1: number; y1: number }[] = [];
            return pr.skupiny.map((s) => {
              const pop = s.popisek ?? {};
              const posun = pop.posun ?? { x: 0.2, y: -0.2 };
              const kotva = pop.zarovnani ?? 'start';
              return (
                <g key={s.id}>
                  {teckySkupiny(s, db).map((q, i) => {
                    const text = rost(q.kod)?.latin ?? q.kod;
                    const x = q.x + posun.x, y = q.y + posun.y;
                    const sirka = text.length * 1.25 * tl;
                    const x0 = kotva === 'end' ? x - sirka : kotva === 'middle' ? x - sirka / 2 : x;
                    const ram = { x0, y0: y - 2.4 * tl, x1: x0 + sirka, y1: y + 0.6 * tl };
                    if (obsazeno.some((o) => ram.x0 < o.x1 && ram.x1 > o.x0 && ram.y0 < o.y1 && ram.y1 > o.y0)) return null;
                    obsazeno.push(ram);
                    return (
                      <text key={i} x={x} y={y} fontSize={2.2 * tl} fontStyle="italic" textAnchor={kotva}
                        fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke"
                        transform={pop.otoceni ? `rotate(${pop.otoceni} ${x} ${y})` : undefined}>{text}</text>
                    );
                  })}
                </g>
              );
            });
          })()}

          {pr.solitery.map((s) => {
            const r = rost(s.kod);
            const pop = s.popisek ?? {};
            const x = s.pos.x + (pop.posun?.x ?? 0), y = s.pos.y + (pop.posun?.y ?? -1.4);
            return (
              <text key={s.id} x={x} y={y} textAnchor={pop.zarovnani ?? 'middle'} fontSize={2.8 * tl}
                fontStyle="italic" fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke"
                transform={pop.otoceni ? `rotate(${pop.otoceni} ${x} ${y})` : undefined}>
                {r?.latin ?? s.kod}
              </text>
            );
          })}
        </svg>

        {/* legenda po straně listu */}
        {legendaW > 0 && (
          <div style={{ position: 'absolute', right: `${OKRAJ}mm`, top: `${OKRAJ}mm`, width: `${LEGENDA_W - 4}mm`, height: `${kreslici.h}mm` }}
            className="overflow-hidden border-l border-gray-300 pl-[3mm] text-[6.2pt] leading-[1.35]">
            <div className="mb-[1.5mm] text-[7pt] font-bold">Legenda</div>
            {radky.map((r) => (
              <div key={r.kod} className="mb-[0.6mm] flex items-start gap-[1mm]">
                <span className="mt-[0.4mm] inline-block h-[2.4mm] w-[2.4mm] shrink-0 border border-gray-400"
                  style={{ background: kat[r.rostlina?.kat ?? 'T']?.fill }} />
                <span className="w-[7mm] shrink-0 font-bold">{r.kod}</span>
                <span className="min-w-0 flex-1 italic">{r.rostlina?.latin ?? '—'}</span>
                <span className="shrink-0 font-medium">{r.kusu}</span>
              </div>
            ))}
          </div>
        )}

        {/* rohové razítko */}
        <div style={{ position: 'absolute', left: `${OKRAJ}mm`, right: `${OKRAJ}mm`, bottom: `${OKRAJ / 2}mm` }}
          className="flex items-end justify-between border-t border-gray-800 pt-[1mm] text-[8pt]">
          <div><b>{pr.nazev}</b> — osazovací plán</div>
          <div>{radky.reduce((a, r) => a + r.kusu, 0)} ks · {radky.length} druhů</div>
          <div>měřítko 1:{meritko} · {new Date().toLocaleDateString('cs-CZ')}</div>
        </div>
      </div>

      {/* ------------------------------------------------- list 2: výkaz */}
      {radky.length > 0 && (
        <div style={{ width: `${list.w}mm`, minHeight: `${list.h}mm`, breakBefore: 'page' }}
          className="mx-auto mt-4 bg-white p-[10mm] shadow print:mt-0 print:shadow-none">
          <h2 className="mb-[2mm] text-[12pt] font-bold">{pr.nazev} — výkaz rostlin</h2>
          <table className="w-full text-[8pt]">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="w-[10mm] py-[0.5mm]">kód</th><th>latinský název</th><th>český název</th>
                <th className="w-[22mm]">kategorie</th><th className="w-[12mm] text-right">ks</th>
                <th className="w-[14mm] text-right">m²</th>
              </tr>
            </thead>
            <tbody>
              {radky.map((r) => (
                <tr key={r.kod} className="border-b border-gray-200">
                  <td className="py-[0.4mm] font-bold">{r.kod}</td>
                  <td className="italic">{r.rostlina?.latin ?? '—'}</td>
                  <td>{r.rostlina?.cesky ?? ''}</td>
                  <td>{r.rostlina?.kategorie ?? ''}</td>
                  <td className="text-right font-medium">{r.kusu}</td>
                  <td className="text-right text-gray-600">{r.plocha ? r.plocha.toFixed(1) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-800 font-bold">
                <td colSpan={4} className="py-[0.8mm]">celkem</td>
                <td className="text-right">{radky.reduce((a, r) => a + r.kusu, 0)}</td>
                <td className="text-right">{radky.reduce((a, r) => a + r.plocha, 0).toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
