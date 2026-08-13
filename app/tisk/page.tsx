'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  P, add, bodProPopisek, bodyPoCare, cesta, dist, lerp, mul, naBody, norm, obalka, sjednot, sub,
} from '@/lib/geom';
import { Databaze, KatInfo, Projekt, Rostlina, popisekPlosky, vykaz } from '@/lib/model';
import { nactiUlozeny } from '@/lib/store';
import { nacti } from '@/lib/idb';

const PAPIRY: Record<string, { w: number; h: number }> = {
  A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 }, A2: { w: 594, h: 420 }, A1: { w: 841, h: 594 },
};

export default function Tisk() {
  const [pr, setPr] = useState<Projekt | null>(null);
  const [db, setDb] = useState<Rostlina[]>([]);
  const [kat, setKat] = useState<Record<string, KatInfo>>({});
  const [podklad, setPodklad] = useState<string | null>(null);
  const [papir, setPapir] = useState('A3');
  const [meritko, setMeritko] = useState(100);

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

  const radky = useMemo(() => (pr ? vykaz(pr, db) : []), [pr, db]);

  if (!pr) return <p className="p-8">Není co tisknout — nejdřív si v editoru rozkresli plán.</p>;

  const list = PAPIRY[papir];
  const okraj = 12;
  const kreslici = { w: list.w - 2 * okraj, h: list.h - 2 * okraj - 16 };
  // metru na milimetr papiru
  const mnm = meritko / 1000;
  const svetW = kreslici.w * mnm, svetH = kreslici.h * mnm;

  const body: P[] = [];
  for (const z of pr.zahony) for (const p of z.plosky) body.push(...naBody(p.ring, 0.1));
  for (const s of pr.skupiny) body.push(...s.body);
  for (const s of pr.solitery) body.push(s.pos);
  const o = body.length ? obalka(body) : { x0: 0, y0: 0, x1: svetW, y1: svetH, w: svetW, h: svetH };
  const stredX = (o.x0 + o.x1) / 2, stredY = (o.y0 + o.y1) / 2;
  const vb = `${stredX - svetW / 2} ${stredY - svetH / 2} ${svetW} ${svetH}`;
  const sedi = o.w <= svetW && o.h <= svetH;
  const tl = mnm;   // 1 mm v metrech

  const rost = (kod?: string) => db.find((r) => r.kod === kod);

  return (
    <>
      <style>{`@page { size: ${list.w}mm ${list.h}mm; margin: 0; }
        @media print { .bezTisku { display: none !important; } body { background: #fff; } }`}</style>

      <div className="bezTisku sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-2 text-sm print:hidden">
        <b>Tisk plánu</b>
        <label>papír <select value={papir} onChange={(e) => setPapir(e.target.value)} className="rounded border px-1 py-0.5">
          {Object.keys(PAPIRY).map((k) => <option key={k}>{k}</option>)}
        </select></label>
        <label>měřítko 1: <input type="number" value={meritko} onChange={(e) => setMeritko(+e.target.value || 100)}
          className="w-20 rounded border px-1 py-0.5" /></label>
        <span className={sedi ? 'text-emerald-700' : 'text-red-600'}>
          {sedi ? 'plán se na list vejde' : `plán je větší než list (${o.w.toFixed(1)} × ${o.h.toFixed(1)} m) — zvol větší papír nebo měřítko`}
        </span>
        <button onClick={() => window.print()} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-white">Vytisknout</button>
      </div>

      {/* ---------------------------------------------------- list 1: plan */}
      <div style={{ width: `${list.w}mm`, height: `${list.h}mm` }} className="relative mx-auto bg-white shadow print:shadow-none">
        <svg width={`${kreslici.w}mm`} height={`${kreslici.h}mm`} viewBox={vb}
          style={{ position: 'absolute', left: `${okraj}mm`, top: `${okraj}mm` }}>
          {/* vybarveni */}
          {pr.zahony.map((zh) => zh.plosky.map((p) => (
            <path key={p.id} d={cesta(p.ring)} fill={rost(p.kod) ? kat[rost(p.kod)!.kat]?.fill ?? '#eee' : '#eee'} />
          )))}

          {/* podklad s rastrem pres vybarveni */}
          {pr.podklad && podklad && (
            <image href={podklad} x={pr.podklad.x} y={pr.podklad.y}
              width={pr.podklad.sirkaM} height={pr.podklad.vyskaM}
              style={{ mixBlendMode: 'multiply' }} opacity={pr.podklad.kryti} preserveAspectRatio="none" />
          )}

          {pr.zahony.map((zh) => zh.plosky.map((p) => (
            <path key={p.id} d={cesta(p.ring)} fill="none" stroke="#666" strokeWidth={0.18 * tl} />
          )))}
          {pr.zahony.map((zh) => sjednot(zh.plosky.map((p) => naBody(p.ring, 0.01))).map((r, i) => (
            <path key={zh.id + i} d={cesta(r)} fill="none" stroke="#111" strokeWidth={0.5 * tl} />
          )))}

          {pr.skupiny.map((s) => {
            const r = rost(s.kod);
            const b = naBody(s.body, 0.02, false);
            const tecky = bodyPoCare(b, s.rozestup ?? r?.rozestup ?? 1.2);
            return (
              <g key={s.id}>
                <polyline points={b.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#111" strokeWidth={0.25 * tl} />
                {tecky.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={(r?.koruna ?? 1.5) / 2} fill="none" stroke="#111" strokeWidth={0.2 * tl} />)}
                {tecky.map((q, i) => <circle key={'d' + i} cx={q.x} cy={q.y} r={0.6 * tl} fill="#111" />)}
              </g>
            );
          })}

          {pr.solitery.map((s) => {
            const r = rost(s.kod);
            return (
              <g key={s.id}>
                <circle cx={s.pos.x} cy={s.pos.y} r={(s.koruna ?? r?.koruna ?? 4) / 2} fill="none" stroke="#111" strokeWidth={0.25 * tl} />
                <circle cx={s.pos.x} cy={s.pos.y} r={1.2 * tl} fill="#111" />
              </g>
            );
          })}

          {pr.ukazKoty && pr.koty.map((k) => {
            const smer = norm(sub(k.b, k.a));
            const n = { x: -smer.y, y: smer.x };
            const a2 = add(k.a, mul(n, k.odsazeni)), b2 = add(k.b, mul(n, k.odsazeni));
            const c = lerp(a2, b2, 0.5);
            return (
              <g key={k.id} stroke="#111" strokeWidth={0.15 * tl}>
                <line x1={k.a.x} y1={k.a.y} x2={a2.x} y2={a2.y} />
                <line x1={k.b.x} y1={k.b.y} x2={b2.x} y2={b2.y} />
                <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
                <text x={c.x} y={c.y - 0.8 * tl} textAnchor="middle" fontSize={2.4 * tl} fill="#111" stroke="none">
                  {dist(k.a, k.b).toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* popisky nad vsim */}
          {pr.zahony.map((zh) => zh.plosky.map((p) => {
            if (!p.kod) return null;
            const c = add(bodProPopisek(naBody(p.ring, 0.02)), p.popisek ?? { x: 0, y: 0 });
            return (
              <text key={p.id} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={2.6 * tl} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke">
                {popisekPlosky(p, rost(p.kod))}
              </text>
            );
          }))}

          {pr.skupiny.map((s) => {
            const stred = s.body[Math.floor(s.body.length / 2)];
            const c = add(stred, s.popisek ?? { x: 0, y: -1.2 });
            return (
              <text key={s.id} x={c.x} y={c.y} textAnchor="middle" fontSize={2.6 * tl} fontStyle="italic"
                fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke">
                {rost(s.kod)?.latin ?? s.kod}
              </text>
            );
          })}

          {pr.solitery.map((s) => {
            const c = add(s.pos, s.popisek ?? { x: 0, y: -1.2 });
            return (
              <text key={s.id} x={c.x} y={c.y} textAnchor="middle" fontSize={2.8 * tl} fontStyle="italic"
                fill="#111" stroke="#fff" strokeWidth={0.7 * tl} paintOrder="stroke">
                {rost(s.kod)?.latin ?? s.kod}
              </text>
            );
          })}
        </svg>

        {/* rohove razitko */}
        <div style={{ position: 'absolute', left: `${okraj}mm`, bottom: `${okraj / 2}mm`, right: `${okraj}mm` }}
          className="flex items-end justify-between border-t border-gray-800 pt-1 text-[9pt]">
          <div><b>{pr.nazev}</b> — osazovací plán</div>
          <div>měřítko 1:{meritko} · {new Date().toLocaleDateString('cs-CZ')}</div>
        </div>
      </div>

      {/* ------------------------------------------------ list 2: seznam */}
      <div style={{ width: `${list.w}mm`, minHeight: `${list.h}mm`, breakBefore: 'page' }}
        className="mx-auto mt-4 bg-white p-[12mm] shadow print:mt-0 print:shadow-none">
        <h2 className="mb-2 text-[13pt] font-bold">{pr.nazev} — výkaz rostlin</h2>
        <table className="w-full text-[8.5pt]">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="w-12 py-1">kód</th><th>latinský název</th><th>český název</th>
              <th className="w-20">kategorie</th><th className="w-14 text-right">ks</th><th className="w-16 text-right">m²</th>
            </tr>
          </thead>
          <tbody>
            {radky.map((r) => (
              <tr key={r.kod} className="border-b border-gray-200">
                <td className="py-0.5 font-bold">{r.kod}</td>
                <td className="italic">{r.rostlina?.latin ?? '—'}</td>
                <td>{r.rostlina?.cesky ?? ''}</td>
                <td>{r.rostlina?.kategorie ?? ''}</td>
                <td className="text-right font-medium">{r.kusu}</td>
                <td className="text-right">{r.plocha ? r.plocha.toFixed(1) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-800 font-bold">
              <td colSpan={4} className="py-1">celkem</td>
              <td className="text-right">{radky.reduce((a, r) => a + r.kusu, 0)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
