'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  P, V, add, bodVPolygonu, bodyPoCare, bulgeZBodu, cesta, cestaBody, delkaHrany, dist, lerp, mul,
  naBody, obalka, sub, vzdalUsecka,
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
    urovenStetec, upravovat, prichytavat, meri, vybranaSkupina,
  } = useStore();
  const st = useStore;
  const krok = pr.krok;
  const rozvrhy = useRozvrhy();

  const [mys, setMys] = useState<P | null>(null);
  // tah zvyraznovacem se sbira do ref (aktualni hned), stav je jen pro prekresleni -
       // pri rychlem tazeni React nestiha prerenderovat a body by se ztracely
  const tahRef = useRef<P[] | null>(null);
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
    if (prichytavat) {
      // 1. rohy uz nakreslenych zahonu
      for (const zh of pr.zahony) for (const v of zh.obrys) if (dist(p, v) < tol) return { x: v.x, y: v.y };
      // 2. prvni bod rozkresleneho obrysu (uzavreni)
      if (koncept.length > 2 && dist(p, koncept[0]) < tol) return { x: koncept[0].x, y: koncept[0].y };
      // 3. nejblizsi misto na hrane jineho zahonu
      let nej: P | null = null, nejD = tol;
      for (const zh of pr.zahony) {
        const body = obrysy.get(zh.id) ?? [];
        for (let i = 0, j = body.length - 1; i < body.length; j = i++) {
          const a = body[j], b = body[i];
          const ab = sub(b, a), ap = sub(p, a);
          const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
          const q = add(a, mul(ab, t));
          const d = dist(p, q);
          if (d < nejD) { nejD = d; nej = q; }
        }
      }
      if (nej) return nej;
    }
    if (ortho && koncept.length) {
      const a = koncept[koncept.length - 1];
      const uh = Math.atan2(p.y - a.y, p.x - a.x);
      const zaokr = Math.round(uh / (Math.PI / 4)) * (Math.PI / 4);
      const d = dist(a, p);
      return { x: a.x + Math.cos(zaokr) * d, y: a.y + Math.sin(zaokr) * d };
    }
    return p;
  }, [pr.zahony, koncept, z, prichytavat, obrysy]);

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
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* pero/dotyk */ }
    const p = pozice(e);
    // krok se cte ze store, ne ze zavreni funkce - po prepnuti kroku muze prijit
    // klik driv, nez se komponenta prekresli
    const krok = st.getState().pr.krok;

    // posun plátna: prostrední/pravé tlačítko nebo Alt
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      panRef.current = { sx: e.clientX, sy: e.clientY, kx: kamera.x, ky: kamera.y };
      return;
    }
    if (e.button !== 0) return;

    // mereni vzdalenosti na podkladu (a pripadna kalibrace meritka)
    if (krok === 1 && meri) {
      const k = st.getState().koncept;
      st.getState().set('koncept', k.length >= 2 ? [p] : [...k, p]);
      return;
    }

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
      // stav se cte ze store, ne ze zavreni funkce - jinak by se pri rychlem
      // klikani za sebou body prepisovaly misto pridavani
      const akt = st.getState().koncept;
      const b = snap(p, e.shiftKey);
      if (akt.length > 2 && dist(b, akt[0]) < 12 / z) { uzavriZahon(); return; }
      st.getState().set('koncept', [...akt, b]);
      return;
    }

    if (krok === 3) {
      const zh = zahonPod(p);
      if (zh) st.getState().set('aktivniZahon', zh.id);
      tahRef.current = [p];
      setTah([p]);
      return;
    }

    if (krok === 4) {
      const zh = zahonPod(p);
      if (zh) st.getState().set('aktivniZahon', zh.id);
      return;
    }

    if (krok === 5) {
      // kdyz se prave nekresli, klik na hotovou radu ji vybere (kvuli rozestupu)
      if (!st.getState().koncept.length) {
        const tol = 10 / z;
        const trefena = pr.skupiny.find((s) => {
          const body = naBody(s.body, 0.05, false);
          for (let i = 1; i < body.length; i++) if (vzdalUsecka(p, body[i - 1], body[i]) < tol) return true;
          return false;
        });
        if (trefena) { st.getState().set('vybranaSkupina', trefena.id); return; }
      }
      if (!aktivniKod) return;
      st.getState().set('vybranaSkupina', null);
      st.getState().set('koncept', [...st.getState().koncept, snap(p, e.shiftKey)]);
      return;
    }

    if (krok === 6) {
      if (!aktivniKod) return;
      const r = rostlina(aktivniKod);
      st.getState().zmen((d) => d.solitery.push({ id: id(), kod: aktivniKod, pos: p, koruna: r?.koruna ?? 4 }));
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

    if (tahRef.current && e.buttons === 1) {
      const body = tahRef.current;
      if (dist(body[body.length - 1], p) > 0.12) {
        body.push(p);
        setTah([...body]);
      }
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
    const nakresleno = tahRef.current;
    if (nakresleno && nakresleno.length >= 1 && st.getState().pr.krok === 3) {
      const cil = st.getState().aktivniZahon ?? pr.zahony[0]?.id;
      if (cil) {
        st.getState().zmen((d) => {
          const zh = d.zahony.find((x) => x.id === cil);
          if (zh) zh.vysky.push({ id: id(), uroven: st.getState().urovenStetec, body: nakresleno.map((q) => ({ ...q })) });
        });
      }
    }
    tahRef.current = null;
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
    const rozestup = st.getState().rozestupNovy ?? r?.rozestup ?? 1.2;
    st.getState().zmen((d) => d.skupiny.push({
      id: id(), kod, body: k.map((p) => ({ ...p })), rozestup,
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
  // v kroku 3 se kresli naplno, jinde jen jemne jako voditko
  const ukazVysky = krok === 3 || (pr.ukazVysky && krok === 4);
  const silaVysek = krok === 3 ? 0.32 : 0.16;
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
                {r?.casti.map((c) => (
                  <path key={c.id} d={cestaBody(c.polygon)}
                    fill={kategorie[rostlina(c.kod)?.kat ?? 'T']?.fill ?? PRAZDNA} />
                ))}
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
          {/* metrova sit - na overeni, ze meritko podkladu sedi */}
          {pr.ukazSit && z >= 4 && (() => {
            const x0 = kamera.x - W / (2 * z), x1 = kamera.x + W / (2 * z);
            const y0 = kamera.y - H / (2 * z), y1 = kamera.y + H / (2 * z);
            if ((x1 - x0) + (y1 - y0) > 600) return null;
            const cary: React.ReactElement[] = [];
            for (let x = Math.ceil(x0); x <= x1; x++) {
              cary.push(<line key={'x' + x} x1={x} y1={y0} x2={x} y2={y1} strokeWidth={x % 5 === 0 ? 1.4 : 0.6} />);
            }
            for (let y = Math.ceil(y0); y <= y1; y++) {
              cary.push(<line key={'y' + y} x1={x0} y1={y} x2={x1} y2={y} strokeWidth={y % 5 === 0 ? 1.4 : 0.6} />);
            }
            return <g stroke="#e0189a" opacity={0.45} vectorEffect="non-scaling-stroke">{cary}</g>;
          })()}

          {/* merena vzdalenost */}
          {krok === 1 && meri && koncept.length > 0 && (
            <g stroke="#e0189a" strokeWidth={2} vectorEffect="non-scaling-stroke">
              {koncept.length >= 2
                ? <line x1={koncept[0].x} y1={koncept[0].y} x2={koncept[1].x} y2={koncept[1].y} />
                : mys && <line x1={koncept[0].x} y1={koncept[0].y} x2={mys.x} y2={mys.y} strokeDasharray="6 4" />}
              {koncept.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / z} fill="#e0189a" stroke="none" />)}
            </g>
          )}

          {pr.zahony.map((zh) => {
            const r = rozvrhy.get(zh.id);
            const je = zh.id === aktivniZahon;
            return (
              <g key={zh.id}>
                {/* hranice plosek rostlin */}
                {r?.casti.map((c) => (
                  <path key={c.id} d={cestaBody(c.polygon)} fill="none" stroke="#8a8a8a"
                    strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                ))}
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

          {/* zvyraznovac vyskovych oblasti - jen pomucka, do vykresu nepatri */}
          {ukazVysky && pr.zahony.flatMap((zh) => zh.vysky.map((t) => (
            <polyline key={t.id} points={t.body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
              stroke={UROVNE[t.uroven].barva} strokeWidth={0.9} strokeLinecap="round"
              strokeLinejoin="round" opacity={silaVysek} />
          )))}
          {tah && (
            <polyline points={tah.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
              stroke={UROVNE[urovenStetec].barva} strokeWidth={0.9} strokeLinecap="round"
              strokeLinejoin="round" opacity={0.4} />
          )}

          {/* skupiny keru - jen spojene tecky, zadny prumer koruny */}
          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const body = naBody(s.body, 0.02, false);
            const tecky = bodyPoCare(body, s.rozestup ?? r?.rozestup ?? 1.2);
            const je = s.id === vybranaSkupina;
            return (
              <g key={s.id}>
                <polyline points={tecky.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
                  stroke={je ? '#0a7' : '#111'} strokeWidth={je ? 2.5 : 1} vectorEffect="non-scaling-stroke" />
                {tecky.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={0.14} fill={je ? '#0a7' : '#111'} />)}
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
          {pr.zahony.flatMap((zh) => (rozvrhy.get(zh.id)?.casti ?? []).map((c) => {
            const p = naObraz(c.popisek);
            return (
              <g key={c.id}>
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={11} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                  {c.kod}{c.kusu}
                </text>
                {pr.ukazPlochy && (
                  <text x={p.x} y={p.y + 11} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fill="#555" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
                    {c.plocha.toFixed(1)} m²
                  </text>
                )}
              </g>
            );
          }))}

          {/* delky stran zahonu */}
          {pr.ukazDelky && pr.zahony.flatMap((zh) => zh.obrys.map((v, i) => {
            const b = zh.obrys[(i + 1) % zh.obrys.length];
            const d = delkaHrany(v, b, v.b);
            if (d < 0.3) return null;
            const c = naObraz(lerp(v, b, 0.5));
            return (
              <text key={zh.id + i} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill="#0a7" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {d.toFixed(2)}
              </text>
            );
          }))}

          {/* celkova vymera zahonu */}
          {pr.ukazPlochy && pr.zahony.map((zh) => {
            const r = rozvrhy.get(zh.id);
            const body = obrysy.get(zh.id) ?? [];
            if (!r || !body.length) return null;
            const o = obalka(body);
            const c = naObraz({ x: (o.x0 + o.x1) / 2, y: o.y1 });
            return (
              <text key={zh.id} x={c.x} y={c.y + 14} textAnchor="middle"
                fontSize={11} fontWeight={600} fill="#0a7" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {zh.nazev} · {r.plocha.toFixed(1)} m²
              </text>
            );
          })}

          {/* nazev keře u kazde tecky */}
          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const body = naBody(s.body, 0.02, false);
            const tecky = bodyPoCare(body, s.rozestup ?? r?.rozestup ?? 1.2);
            return (
              <g key={s.id}>
                {tecky.map((q, i) => {
                  const c = naObraz(q);
                  return (
                    <text key={i} x={c.x + 5} y={c.y - 4} fontSize={9.5} fontStyle="italic" fill="#111"
                      stroke="#fff" strokeWidth={2.5} paintOrder="stroke">{r?.latin ?? s.kod}</text>
                  );
                })}
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

          {krok === 1 && meri && koncept.length >= 2 && (() => {
            const c = naObraz(lerp(koncept[0], koncept[1], 0.5));
            return (
              <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill="#e0189a"
                stroke="#fff" strokeWidth={3.5} paintOrder="stroke">
                {dist(koncept[0], koncept[1]).toFixed(2)} m
              </text>
            );
          })()}

          {krok !== 1 && koncept.length > 0 && mys && (() => {
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
