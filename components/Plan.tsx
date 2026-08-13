'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  P, V, add, bodVPolygonu, bodyPoCare, bulgeZBodu, cesta, cestaBody, dist, lerp, mul, naBody,
  norm, sub, vzdalUsecka,
} from '@/lib/geom';
import { Rostlina, UROVNE, Zahon, id, prazdnyZahon } from '@/lib/model';
import { useStore } from '@/lib/store';
import { useRozvrhy } from '@/lib/useRozvrhy';

const PRAZDNA = '#e6e6e6';

export default function Plan() {
  const box = useRef<HTMLDivElement>(null);
  const [rozmer, setRozmer] = useState({ w: 1200, h: 800 });
  const {
    pr, db, kategorie, kamera, koncept, podkladUrl, aktivniZahon, aktivniKod,
    urovenStetec, upravovat, kotuje,
  } = useStore();
  const st = useStore;
  const krok = pr.krok;
  const rozvrhy = useRozvrhy();

  const [mys, setMys] = useState<P | null>(null);
  const [tah, setTah] = useState<P[] | null>(null);
  const [presna, setPresna] = useState<{ d: string; u: string } | null>(null);
  const uchopRef = useRef<{ zahon: string; typ: 'vrchol' | 'stred'; i: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; kx: number; ky: number } | null>(null);

  const rostlina = useCallback((kod?: string) => db.find((r) => r.kod === kod), [db]);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setRozmer({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = rozmer;
  const z = kamera.z;
  const naObraz = useCallback((p: P) => ({ x: (p.x - kamera.x) * z + W / 2, y: (p.y - kamera.y) * z + H / 2 }), [kamera, z, W, H]);
  const naSvet = useCallback((sx: number, sy: number) => ({ x: (sx - W / 2) / z + kamera.x, y: (sy - H / 2) / z + kamera.y }), [kamera, z, W, H]);
  const gt = `translate(${W / 2} ${H / 2}) scale(${z}) translate(${-kamera.x} ${-kamera.y})`;

  const obrysy = useMemo(
    () => new Map(pr.zahony.map((zh) => [zh.id, naBody(zh.obrys, 0.02)])),
    [pr.zahony],
  );

  const zahonPod = useCallback((p: P): Zahon | undefined =>
    pr.zahony.find((zh) => bodVPolygonu(p, obrysy.get(zh.id) ?? [])), [pr.zahony, obrysy]);

  // ---------------------------------------------------------------- ovladani
  const pozice = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return naSvet(e.clientX - r.left, e.clientY - r.top);
  };

  const snap = useCallback((p: P, ortho: boolean): P => {
    const tol = 12 / z;
    for (const zh of pr.zahony) for (const v of zh.obrys) if (dist(p, v) < tol) return { x: v.x, y: v.y };
    if (ortho && koncept.length) {
      const a = koncept[koncept.length - 1];
      const uh = Math.atan2(p.y - a.y, p.x - a.x);
      const zaokr = Math.round(uh / (Math.PI / 4)) * (Math.PI / 4);
      const d = dist(a, p);
      return { x: a.x + Math.cos(zaokr) * d, y: a.y + Math.sin(zaokr) * d };
    }
    return p;
  }, [pr.zahony, koncept, z]);

  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const pred = naSvet(sx, sy);
    const novy = Math.max(2, Math.min(600, z * Math.pow(1.0015, -e.deltaY)));
    st.getState().setKamera({
      z: novy,
      x: kamera.x + pred.x - ((sx - W / 2) / novy + kamera.x),
      y: kamera.y + pred.y - ((sy - H / 2) / novy + kamera.y),
    });
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = pozice(e);

    // posun plátna: prostrední/pravé tlačítko nebo Alt
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      panRef.current = { sx: e.clientX, sy: e.clientY, kx: kamera.x, ky: kamera.y };
      return;
    }
    if (e.button !== 0) return;

    if (krok === 2) {
      if (upravovat) {
        const tol = 10 / z;
        for (const zh of pr.zahony) {
          for (let i = 0; i < zh.obrys.length; i++) {
            if (dist(p, zh.obrys[i]) < tol) { uchopRef.current = { zahon: zh.id, typ: 'vrchol', i }; return; }
          }
          for (let i = 0; i < zh.obrys.length; i++) {
            const a = zh.obrys[i], b = zh.obrys[(i + 1) % zh.obrys.length];
            if (dist(p, stredHrany(a, b)) < tol) { uchopRef.current = { zahon: zh.id, typ: 'stred', i }; return; }
          }
        }
        const zh = zahonPod(p);
        if (zh) st.getState().set('aktivniZahon', zh.id);
        return;
      }
      const b = snap(p, e.shiftKey);
      if (koncept.length > 2 && dist(b, koncept[0]) < 12 / z) { uzavriZahon(); return; }
      st.getState().set('koncept', [...koncept, b]);
      return;
    }

    if (krok === 3) {
      const zh = zahonPod(p);
      if (zh) st.getState().set('aktivniZahon', zh.id);
      setTah([p]);
      return;
    }

    if (krok === 4) {
      const zh = zahonPod(p);
      if (zh) st.getState().set('aktivniZahon', zh.id);
      return;
    }

    if (krok === 5) {
      if (!aktivniKod) return;
      st.getState().set('koncept', [...koncept, snap(p, e.shiftKey)]);
      return;
    }

    if (krok === 6) {
      if (!aktivniKod) return;
      const r = rostlina(aktivniKod);
      st.getState().zmen((d) => d.solitery.push({ id: id(), kod: aktivniKod, pos: p, koruna: r?.koruna ?? 4 }));
      return;
    }

    if (krok === 7 && kotuje) {
      const k = [...koncept, p];
      if (k.length < 2) { st.getState().set('koncept', k); return; }
      st.getState().zmen((d) => d.koty.push({ id: id(), a: k[0], b: k[1], odsazeni: 0.6 }));
      st.getState().set('koncept', []);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const d = panRef.current;
      st.getState().setKamera({ x: d.kx - (e.clientX - d.sx) / z, y: d.ky - (e.clientY - d.sy) / z });
      return;
    }
    const p = pozice(e);
    setMys(p);

    if (tah && e.buttons === 1) {
      const posledni = tah[tah.length - 1];
      if (dist(posledni, p) > 0.12) setTah([...tah, p]);
      return;
    }

    const u = uchopRef.current;
    if (!u || e.buttons !== 1) return;
    st.getState().zmen((d) => {
      const zh = d.zahony.find((x) => x.id === u.zahon);
      if (!zh) return;
      if (u.typ === 'vrchol') { zh.obrys[u.i].x = p.x; zh.obrys[u.i].y = p.y; }
      else {
        const a = zh.obrys[u.i], b = zh.obrys[(u.i + 1) % zh.obrys.length];
        zh.obrys[u.i].b = bulgeZBodu(a, b, p);
      }
    });
  };

  const onUp = () => {
    panRef.current = null;
    uchopRef.current = null;
    if (tah && tah.length >= 1 && krok === 3) {
      const cil = st.getState().aktivniZahon ?? pr.zahony[0]?.id;
      if (cil) {
        st.getState().zmen((d) => {
          const zh = d.zahony.find((x) => x.id === cil);
          if (zh) zh.vysky.push({ id: id(), uroven: urovenStetec, body: tah.map((q) => ({ ...q })) });
        });
      }
    }
    setTah(null);
  };

  // ----------------------------------------------------------- dokonceni
  const uzavriZahon = useCallback(() => {
    const k = st.getState().koncept;
    if (k.length < 3) return;
    const novy = prazdnyZahon(k.map((p) => ({ ...p })), st.getState().pr.zahony.length + 1);
    st.getState().zmen((d) => { d.zahony.push(novy); });
    st.getState().set('koncept', []);
    st.getState().set('aktivniZahon', novy.id);
    setPresna(null);
  }, [st]);

  const uzavriKere = useCallback(() => {
    const k = st.getState().koncept;
    const kod = st.getState().aktivniKod;
    if (k.length < 2 || !kod) return;
    const r = st.getState().db.find((x) => x.kod === kod);
    st.getState().zmen((d) => d.skupiny.push({
      id: id(), kod, body: k.map((p) => ({ ...p })), rozestup: r?.rozestup ?? 1.2,
    }));
    st.getState().set('koncept', []);
    setPresna(null);
  }, [st]);

  const hotovo = useCallback(() => {
    if (st.getState().pr.krok === 2) uzavriZahon();
    else if (st.getState().pr.krok === 5) uzavriKere();
  }, [st, uzavriZahon, uzavriKere]);

  // -------------------------------------------------------------- klavesy
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const c = e.target as HTMLElement;
      if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
      if (e.key === 'Enter') { hotovo(); e.preventDefault(); }
      else if (e.key === 'Escape') { st.getState().set('koncept', []); setPresna(null); setTah(null); }
      else if (e.key === 'Backspace' && st.getState().koncept.length) {
        st.getState().set('koncept', st.getState().koncept.slice(0, -1)); e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.getState().vpred(); else st.getState().zpet();
      } else if (/^[0-9]$/.test(e.key) && st.getState().koncept.length && !presna) {
        setPresna({ d: e.key, u: '' }); e.preventDefault();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [hotovo, presna, st]);

  const potvrdPresnou = () => {
    if (!presna || !koncept.length) return;
    const d = parseFloat(presna.d.replace(',', '.'));
    if (!(d > 0)) { setPresna(null); return; }
    const a = koncept[koncept.length - 1];
    const smer = presna.u !== ''
      ? (parseFloat(presna.u.replace(',', '.')) * Math.PI) / 180
      : Math.atan2((mys?.y ?? a.y + 1) - a.y, (mys?.x ?? a.x) - a.x);
    st.getState().set('koncept', [...koncept, { x: a.x + Math.cos(smer) * d, y: a.y + Math.sin(smer) * d }]);
    setPresna(null);
  };

  // -------------------------------------------------------------- vykresli
  const podklad = pr.podklad;
  const ukazVysky = krok === 3;
  const kurzor = krok === 1 || krok === 4 ? 'default' : krok === 3 ? 'cell' : 'crosshair';

  return (
    <div
      ref={box}
      className="relative h-full w-full overflow-hidden bg-white select-none"
      onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: kurzor, touchAction: 'none' }}
    >
      {/* 1 — vybarveni zahonu, pod rastrem podkladu */}
      <svg className="absolute inset-0" width={W} height={H}>
        <g transform={gt}>
          {pr.zahony.map((zh) => {
            const r = rozvrhy.get(zh.id);
            return (
              <g key={zh.id}>
                <path d={cesta(zh.obrys)} fill={PRAZDNA} />
                {!ukazVysky && r?.casti.map((c) => (
                  <path key={c.id} d={cestaBody(c.polygon)}
                    fill={kategorie[rostlina(c.kod)?.kat ?? 'T']?.fill ?? PRAZDNA} />
                ))}
                {ukazVysky && r?.oblasti.map((ob, i) => ob.polygony.map((pg, j) => (
                  <path key={`${i}-${j}`} d={cestaBody(pg)} fill={UROVNE[ob.uroven].barva} fillOpacity={0.3} />
                )))}
              </g>
            );
          })}
        </g>
      </svg>

      {/* 2 — podklad; nasobenim zmizi bila a zustane cyan rastr */}
      {podklad && podkladUrl && (
        <div className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-kamera.x}px, ${-kamera.y}px)`, pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="podklad" src={podkladUrl} className="absolute origin-top-left"
            style={{
              left: 0, top: 0,
              width: `${podklad.pxW || 1000}px`, height: `${podklad.pxH || 1000}px`,
              maxWidth: 'none', maxHeight: 'none',
              transform: `translate(${podklad.x}px, ${podklad.y}px) rotate(${podklad.otoceni}deg) scale(${podklad.sirkaM / (podklad.pxW || 1000)})`,
              mixBlendMode: 'multiply',
              opacity: podklad.kryti,
            }} />
        </div>
      )}

      {/* 3 — cary a popisky, nad rastrem */}
      <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
        <g transform={gt}>
          {pr.zahony.map((zh) => {
            const r = rozvrhy.get(zh.id);
            const je = zh.id === aktivniZahon;
            return (
              <g key={zh.id}>
                {/* hranice plosek rostlin */}
                {!ukazVysky && r?.casti.map((c) => (
                  <path key={c.id} d={cestaBody(c.polygon)} fill="none" stroke="#8a8a8a"
                    strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                ))}
                {/* vyskove oblasti - jen barevne ohraniceni */}
                {r?.oblasti.map((ob, i) => ob.polygony.map((pg, j) => (
                  <path key={`o${i}-${j}`} d={cestaBody(pg)} fill="none" stroke={UROVNE[ob.uroven].barva}
                    strokeWidth={ukazVysky ? 2.5 : 1.6} vectorEffect="non-scaling-stroke" />
                )))}
                {/* obrys zahonu */}
                <path d={cesta(zh.obrys)} fill="none" stroke={je && krok <= 4 ? '#0a7' : '#111'}
                  strokeWidth={je && krok <= 4 ? 3 : 2} vectorEffect="non-scaling-stroke" />
                {/* uchopove body pri uprave tvaru */}
                {krok === 2 && upravovat && je && (
                  <>
                    {zh.obrys.map((v, i) => (
                      <rect key={i} x={v.x - 4 / z} y={v.y - 4 / z} width={8 / z} height={8 / z}
                        fill="#fff" stroke="#0a7" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    ))}
                    {zh.obrys.map((v, i) => {
                      const s = stredHrany(v, zh.obrys[(i + 1) % zh.obrys.length]);
                      return <circle key={'s' + i} cx={s.x} cy={s.y} r={3.5 / z} fill="#0a7" opacity={0.8} />;
                    })}
                  </>
                )}
              </g>
            );
          })}

          {/* nacrtnute tahy vysek */}
          {ukazVysky && pr.zahony.flatMap((zh) => zh.vysky.map((t) => (
            <polyline key={t.id} points={t.body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
              stroke={UROVNE[t.uroven].barva} strokeWidth={3} strokeLinecap="round"
              opacity={0.9} vectorEffect="non-scaling-stroke" />
          )))}
          {tah && (
            <polyline points={tah.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
              stroke={UROVNE[urovenStetec].barva} strokeWidth={3} strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          )}

          {/* skupiny keru */}
          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const body = naBody(s.body, 0.02, false);
            const tecky = bodyPoCare(body, s.rozestup ?? r?.rozestup ?? 1.2);
            return (
              <g key={s.id}>
                <polyline points={body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
                  stroke="#111" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                {tecky.map((q, i) => (
                  <circle key={i} cx={q.x} cy={q.y} r={Math.max(0.25, (r?.koruna ?? 1.2) / 2)}
                    fill={kategorie[r?.kat ?? 'K']?.fill ?? '#d9edd1'} fillOpacity={0.4}
                    stroke="#111" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
                ))}
                {tecky.map((q, i) => <circle key={'d' + i} cx={q.x} cy={q.y} r={0.13} fill="#111" />)}
              </g>
            );
          })}

          {/* stromy */}
          {pr.solitery.map((s) => {
            const r = rostlina(s.kod);
            const kr = (s.koruna ?? r?.koruna ?? 4) / 2;
            return (
              <g key={s.id}>
                <circle cx={s.pos.x} cy={s.pos.y} r={kr} fill="none" stroke="#111"
                  strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle cx={s.pos.x} cy={s.pos.y} r={0.28} fill="#111" />
                {s.vicekmen && <circle cx={s.pos.x} cy={s.pos.y} r={0.55} fill="none" stroke="#111"
                  strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
              </g>
            );
          })}

          {/* koty */}
          {pr.ukazKoty && pr.koty.map((k) => {
            const smer = norm(sub(k.b, k.a));
            const n = { x: -smer.y, y: smer.x };
            const a2 = add(k.a, mul(n, k.odsazeni)), b2 = add(k.b, mul(n, k.odsazeni));
            return (
              <g key={k.id} stroke="#0a7" strokeWidth={1} vectorEffect="non-scaling-stroke">
                <line x1={k.a.x} y1={k.a.y} x2={a2.x} y2={a2.y} />
                <line x1={k.b.x} y1={k.b.y} x2={b2.x} y2={b2.y} />
                <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
              </g>
            );
          })}

          {/* rozkreslene */}
          {koncept.length > 0 && (
            <>
              <polyline points={[...koncept, ...(mys ? [mys] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke="#0a7" strokeWidth={2} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
              {koncept.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / z} fill="#0a7" />)}
            </>
          )}
        </g>

        {/* texty v obrazovych souradnicich */}
        <g>
          {!ukazVysky && pr.zahony.flatMap((zh) => (rozvrhy.get(zh.id)?.casti ?? []).map((c) => {
            const p = naObraz(c.popisek);
            return (
              <text key={c.id} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {c.kod}{c.kusu}
              </text>
            );
          }))}

          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const stred = s.body[Math.floor(s.body.length / 2)];
            const c = naObraz(add(stred, s.popisek ?? { x: 0, y: -1.4 }));
            const k = naObraz(stred);
            return (
              <g key={s.id}>
                <line x1={c.x} y1={c.y + 4} x2={k.x} y2={k.y} stroke="#111" strokeWidth={0.6} opacity={0.6} />
                <text x={c.x} y={c.y} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#111"
                  stroke="#fff" strokeWidth={3} paintOrder="stroke">{r?.latin ?? s.kod}</text>
              </g>
            );
          })}

          {pr.solitery.map((s) => {
            const r = rostlina(s.kod);
            const c = naObraz(add(s.pos, s.popisek ?? { x: 0, y: -1.4 }));
            const k = naObraz(s.pos);
            return (
              <g key={s.id}>
                <line x1={c.x} y1={c.y + 4} x2={k.x} y2={k.y} stroke="#111" strokeWidth={0.6} opacity={0.6} />
                <text x={c.x} y={c.y} textAnchor="middle" fontSize={11.5} fontStyle="italic" fontWeight={500}
                  fill="#111" stroke="#fff" strokeWidth={3} paintOrder="stroke">{r?.latin ?? s.kod}</text>
              </g>
            );
          })}

          {pr.ukazKoty && pr.koty.map((k) => {
            const smer = norm(sub(k.b, k.a));
            const c = naObraz(add(lerp(k.a, k.b, 0.5), mul({ x: -smer.y, y: smer.x }, k.odsazeni)));
            return (
              <text key={k.id} x={c.x} y={c.y - 4} textAnchor="middle" fontSize={11} fill="#0a7"
                stroke="#fff" strokeWidth={3} paintOrder="stroke">{dist(k.a, k.b).toFixed(2)} m</text>
            );
          })}

          {koncept.length > 0 && mys && (() => {
            const a = koncept[koncept.length - 1];
            const c = naObraz(lerp(a, mys, 0.5));
            const u = (Math.atan2(mys.y - a.y, mys.x - a.x) * 180) / Math.PI;
            return (
              <text x={c.x + 8} y={c.y - 8} fontSize={12} fill="#0a7" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {dist(a, mys).toFixed(2)} m / {(((u % 360) + 360) % 360).toFixed(0)}°
              </text>
            );
          })()}
        </g>
      </svg>

      {presna && koncept.length > 0 && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-emerald-600 bg-white px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">délka</span>
            <input autoFocus value={presna.d} onChange={(e) => setPresna({ ...presna, d: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') potvrdPresnou(); if (e.key === 'Escape') setPresna(null); }}
              className="w-20 rounded border px-1 py-0.5" /> m
            <span className="ml-2 text-gray-500">úhel</span>
            <input value={presna.u} onChange={(e) => setPresna({ ...presna, u: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') potvrdPresnou(); if (e.key === 'Escape') setPresna(null); }}
              placeholder="dle myši" className="w-20 rounded border px-1 py-0.5" />°
            <button onClick={potvrdPresnou} className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-white">Vložit</button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-2 py-0.5 text-[11px] text-gray-500">
        {mys ? `${mys.x.toFixed(2)} ; ${mys.y.toFixed(2)} m` : '—'} · {z.toFixed(0)} px/m
      </div>
    </div>
  );
}

function stredHrany(a: V, b: V): P {
  if (!a.b) return lerp(a, b, 0.5);
  const d = dist(a, b) || 1;
  return add(lerp(a, b, 0.5), mul({ x: -(b.y - a.y) / d, y: (b.x - a.x) / d }, (a.b * d) / 2));
}

export type { Rostlina };
export { vzdalUsecka };
