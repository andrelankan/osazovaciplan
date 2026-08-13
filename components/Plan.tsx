'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  P, V, bodProPopisek, bodVPolygonu, bodyPoCare, cesta, dist, naBody, protina, teziste,
  rozdel, sjednot, zjednodus, add, sub, mul, norm, lerp, bulgeZBodu, plochaBodu,
} from '@/lib/geom';
import { Ploska, UROVNE, Zahon, id, popisekPlosky } from '@/lib/model';
import { useStore } from '@/lib/store';

const BARVA_PRAZDNA = '#e2e2e2';
const OBRYS_ZAHONU = '#1a1a1a';

type Hit =
  | { typ: 'popisek'; zahon: string; ploska: string }
  | { typ: 'vrchol'; zahon: string; ploska: string; i: number }
  | { typ: 'stred'; zahon: string; ploska: string; i: number }
  | { typ: 'ploska'; zahon: string; ploska: string }
  | { typ: 'solitera'; id: string }
  | { typ: 'solitera-popisek'; id: string }
  | { typ: 'skupina'; id: string }
  | { typ: 'skupina-popisek'; id: string }
  | { typ: 'skupina-vrchol'; id: string; i: number }
  | null;

export default function Plan() {
  const box = useRef<HTMLDivElement>(null);
  const [rozmer, setRozmer] = useState({ w: 1200, h: 800 });
  const { pr, db, kategorie, nastroj, kamera, koncept, vyber, aktivniKod, zobrazeni, podkladUrl } = useStore();
  const st = useStore;
  const [rez, setRez] = useState<P[] | null>(null);
  const [presna, setPresna] = useState<{ d: string; u: string } | null>(null);
  const [mys, setMys] = useState<P | null>(null);
  const dragRef = useRef<Hit>(null);
  const panRef = useRef<{ sx: number; sy: number; kx: number; ky: number } | null>(null);

  const rostlina = useCallback((kod?: string) => db.find((r) => r.kod === kod), [db]);

  // --------------------------------------------------------------- rozmery
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => {
      setRozmer({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = rozmer;
  const z = kamera.z;
  const naObraz = useCallback((p: P) => ({ x: (p.x - kamera.x) * z + W / 2, y: (p.y - kamera.y) * z + H / 2 }), [kamera, z, W, H]);
  const naSvet = useCallback((sx: number, sy: number) => ({ x: (sx - W / 2) / z + kamera.x, y: (sy - H / 2) / z + kamera.y }), [kamera, z, W, H]);
  const gt = `translate(${W / 2} ${H / 2}) scale(${z}) translate(${-kamera.x} ${-kamera.y})`;

  // ----------------------------------------------------- predpocitane tvary
  const tvary = useMemo(() => {
    return pr.zahony.map((zh) => {
      const plosky = zh.plosky.map((p) => {
        const body = naBody(p.ring, 0.01);
        // hledani nejlepsiho mista pro text je drahe - jen tam, kde nejaky text je
        return { p, body, popisek: p.kod ? bodProPopisek(body) : teziste(body), plocha: plochaBodu(body) };
      });
      const obrys = sjednot(plosky.map((x) => x.body));
      return { zh, plosky, obrys };
    });
  }, [pr.zahony]);

  // ------------------------------------------------------------- hit-test
  const najdi = useCallback((sw: P): Hit => {
    const tol = 9 / z;
    // popisky a vrcholy maji prednost
    for (const t of tvary) {
      for (const { p, popisek } of t.plosky) {
        if (!p.kod) continue;
        const c = add(popisek, p.popisek ?? { x: 0, y: 0 });
        if (Math.abs(sw.x - c.x) < 26 / z && Math.abs(sw.y - c.y) < 9 / z)
          return { typ: 'popisek', zahon: t.zh.id, ploska: p.id };
      }
    }
    for (const s of pr.solitery) {
      const c = add(s.pos, s.popisek ?? { x: 0, y: -1.2 });
      if (Math.abs(sw.x - c.x) < 40 / z && Math.abs(sw.y - c.y) < 9 / z) return { typ: 'solitera-popisek', id: s.id };
      if (dist(sw, s.pos) < Math.max(tol, 0.4)) return { typ: 'solitera', id: s.id };
    }
    for (const s of pr.skupiny) {
      const stred = s.body[Math.floor(s.body.length / 2)];
      const c = add(stred, s.popisek ?? { x: 0, y: -1.2 });
      if (Math.abs(sw.x - c.x) < 40 / z && Math.abs(sw.y - c.y) < 9 / z) return { typ: 'skupina-popisek', id: s.id };
      for (let i = 0; i < s.body.length; i++) if (dist(sw, s.body[i]) < tol) return { typ: 'skupina-vrchol', id: s.id, i };
      const body = naBody(s.body, 0.02, false);
      for (let i = 1; i < body.length; i++) if (vzdalOdUsecky(sw, body[i - 1], body[i]) < tol) return { typ: 'skupina', id: s.id };
    }
    for (const t of tvary) {
      for (const { p, body } of t.plosky) {
        for (let i = 0; i < p.ring.length; i++) if (dist(sw, p.ring[i]) < tol) return { typ: 'vrchol', zahon: t.zh.id, ploska: p.id, i };
        for (let i = 0; i < p.ring.length; i++) {
          const a = p.ring[i], b = p.ring[(i + 1) % p.ring.length];
          const s = stredHrany(a, b);
          if (dist(sw, s) < tol) return { typ: 'stred', zahon: t.zh.id, ploska: p.id, i };
        }
        if (bodVPolygonu(sw, body)) return { typ: 'ploska', zahon: t.zh.id, ploska: p.id };
      }
    }
    return null;
  }, [tvary, pr.solitery, pr.skupiny, z]);

  // ---------------------------------------------------------------- snap
  const snap = useCallback((p: P, sTlacitkem: boolean): P => {
    const tol = 12 / z;
    let nej: P | null = null, nejD = tol;
    const zkus = (q: P) => { const d = dist(p, q); if (d < nejD) { nejD = d; nej = { x: q.x, y: q.y }; } };
    for (const t of tvary) for (const pl of t.plosky) for (const v of pl.p.ring) zkus(v);
    for (const s of pr.skupiny) for (const v of s.body) zkus(v);
    for (const s of pr.solitery) zkus(s.pos);
    if (nej) return nej;
    if (sTlacitkem && koncept.length) {
      const a = koncept[koncept.length - 1];
      const dx = p.x - a.x, dy = p.y - a.y;
      const uh = Math.atan2(dy, dx);
      const krok = Math.PI / 4;
      const zaokr = Math.round(uh / krok) * krok;
      const d = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(zaokr) * d, y: a.y + Math.sin(zaokr) * d };
    }
    return p;
  }, [tvary, pr.skupiny, pr.solitery, koncept, z]);

  // ------------------------------------------------------------- udalosti
  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const pred = naSvet(sx, sy);
    const novy = Math.max(2, Math.min(600, z * Math.pow(1.0015, -e.deltaY)));
    const po = { x: (sx - W / 2) / novy + kamera.x, y: (sy - H / 2) / novy + kamera.y };
    st.getState().setKamera({ z: novy, x: kamera.x + pred.x - po.x, y: kamera.y + pred.y - po.y });
  };

  const pozice = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return naSvet(e.clientX - r.left, e.clientY - r.top);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pozice(e);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      panRef.current = { sx: e.clientX, sy: e.clientY, kx: kamera.x, ky: kamera.y };
      return;
    }
    if (e.button !== 0) return;

    if (nastroj === 'vyber') {
      const h = najdi(p);
      dragRef.current = h;
      if (!h) { st.getState().set('vyber', null); return; }
      // jeden krok zpet za cele tazeni, ne za kazdy pixel
      if (h.typ !== 'ploska') st.getState().pamatuj();
      if (h.typ === 'ploska' || h.typ === 'popisek' || h.typ === 'vrchol' || h.typ === 'stred') {
        st.getState().set('vyber', { typ: 'ploska', zahon: h.zahon, ploska: h.ploska });
        // prazdna ploska -> rovnou ukaz katalog, aby bylo jasne, kde se rostlina vybira
        const pl = najdiPlosku(pr.zahony, h.zahon, h.ploska);
        if (pl && !pl.kod) st.getState().set('zalozka', 'katalog');
      }
      else if (h.typ.startsWith('solitera')) st.getState().set('vyber', { typ: 'solitera', id: (h as { id: string }).id });
      else if (h.typ.startsWith('skupina')) st.getState().set('vyber', { typ: 'skupina', id: (h as { id: string }).id });
      return;
    }

    // stetec vyskovych oblasti - kliknutim se casti zahonu prida uroven
    if (nastroj === 'uroven') {
      const h = najdi(p);
      if (h?.typ !== 'ploska' && h?.typ !== 'popisek' && h?.typ !== 'vrchol' && h?.typ !== 'stred') return;
      const uroven = st.getState().urovenStetec;
      st.getState().zmen((d) => {
        const pl = najdiPlosku(d.zahony, h.zahon, h.ploska);
        if (pl) pl.uroven = pl.uroven === uroven ? undefined : uroven;
      });
      st.getState().set('vyber', { typ: 'ploska', zahon: h.zahon, ploska: h.ploska });
      return;
    }

    if (nastroj === 'rez') { setRez([p]); return; }

    if (nastroj === 'strom') {
      if (!aktivniKod) return;
      const r = rostlina(aktivniKod);
      st.getState().zmen((d) => {
        d.solitery.push({ id: id(), kod: aktivniKod, pos: snap(p, false), koruna: r?.koruna ?? 4 });
      });
      return;
    }

    if (nastroj === 'kalibrace' || nastroj === 'kota') {
      const b = snap(p, e.shiftKey);
      const k = [...koncept, b];
      if (k.length < 2) { st.getState().set('koncept', k); return; }
      if (nastroj === 'kota') {
        st.getState().zmen((d) => d.koty.push({ id: id(), a: k[0], b: k[1], odsazeni: 0.6 }));
        st.getState().set('koncept', []);
      } else {
        const skutecna = prompt('Skutečná vzdálenost mezi body v metrech:', dist(k[0], k[1]).toFixed(2));
        const m = parseFloat((skutecna ?? '').replace(',', '.'));
        if (m > 0) {
          const pomer = m / dist(k[0], k[1]);
          st.getState().zmen((d) => {
            if (!d.podklad) return;
            d.podklad.sirkaM *= pomer; d.podklad.vyskaM *= pomer;
            d.podklad.x *= pomer; d.podklad.y *= pomer;
          });
        }
        st.getState().set('koncept', []);
      }
      return;
    }

    // kreslici nastroje - pridani bodu
    const b = snap(p, e.shiftKey);
    if (koncept.length > 2 && dist(b, koncept[0]) < 10 / z && nastroj === 'zahon') {
      dokonci();
      return;
    }
    st.getState().set('koncept', [...koncept, b]);
  };

  const onMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const d = panRef.current;
      st.getState().setKamera({ x: d.kx - (e.clientX - d.sx) / z, y: d.ky - (e.clientY - d.sy) / z });
      return;
    }
    const p = pozice(e);
    setMys(p);

    if (rez) { setRez([...rez, p]); return; }

    const h = dragRef.current;
    if (!h || nastroj !== 'vyber' || e.buttons !== 1) return;

    st.getState().zmenTiche((d) => {
      if (h.typ === 'vrchol') {
        const pl = najdiPlosku(d.zahony, h.zahon, h.ploska);
        if (pl) { pl.ring[h.i].x = p.x; pl.ring[h.i].y = p.y; }
      } else if (h.typ === 'stred') {
        const pl = najdiPlosku(d.zahony, h.zahon, h.ploska);
        if (pl) {
          const a = pl.ring[h.i], b = pl.ring[(h.i + 1) % pl.ring.length];
          pl.ring[h.i].b = bulgeZBodu(a, b, p);
        }
      } else if (h.typ === 'popisek') {
        const t = tvary.find((x) => x.zh.id === h.zahon);
        const pl = najdiPlosku(d.zahony, h.zahon, h.ploska);
        const zaklad = t?.plosky.find((x) => x.p.id === h.ploska)?.popisek;
        if (pl && zaklad) pl.popisek = sub(p, zaklad);
      } else if (h.typ === 'solitera') {
        const s = d.solitery.find((x) => x.id === h.id); if (s) s.pos = p;
      } else if (h.typ === 'solitera-popisek') {
        const s = d.solitery.find((x) => x.id === h.id); if (s) s.popisek = sub(p, s.pos);
      } else if (h.typ === 'skupina-vrchol') {
        const s = d.skupiny.find((x) => x.id === h.id); if (s) { s.body[h.i].x = p.x; s.body[h.i].y = p.y; }
      } else if (h.typ === 'skupina-popisek') {
        const s = d.skupiny.find((x) => x.id === h.id);
        if (s) s.popisek = sub(p, s.body[Math.floor(s.body.length / 2)]);
      }
    });
  };

  const onUp = () => {
    panRef.current = null;
    dragRef.current = null;
    if (rez && rez.length > 1) {
      const cara = zjednodus(rez, 0.05);
      const cely = cara.length >= 2 ? cara : rez;
      st.getState().zmen((d) => {
        for (const zh of d.zahony) {
          const nove: Ploska[] = [];
          for (const pl of zh.plosky) {
            const body = naBody(pl.ring, 0.01);
            if (!protina(body, cely)) { nove.push(pl); continue; }
            const kusy = rozdel(body, cely);
            if (kusy.length < 2) { nove.push(pl); continue; }
            // obe casti si nesou dal rostlinu i vyskovou oblast puvodni plochy
            kusy.forEach((k, i) => {
              nove.push({
                ...pl,
                id: i === 0 ? pl.id : id(),
                ring: k.map((q) => ({ x: q.x, y: q.y })),
                popisek: undefined,
                pocet: undefined,
              });
            });
          }
          zh.plosky = nove;
        }
      });
    }
    setRez(null);
  };

  // ------------------------------------------------------------ dokonceni
  const dokonci = useCallback(() => {
    const k = st.getState().koncept;
    const n = st.getState().nastroj;
    if (n === 'zahon' && k.length >= 3) {
      st.getState().zmen((d) => {
        d.zahony.push({
          id: id(), nazev: `Záhon ${d.zahony.length + 1}`,
          plosky: [{ id: id(), ring: k.map((p) => ({ ...p })) }],
        });
      });
    } else if (n === 'kere' && k.length >= 2) {
      const kod = st.getState().aktivniKod;
      if (kod) {
        const r = st.getState().db.find((x) => x.kod === kod);
        st.getState().zmen((d) => d.skupiny.push({
          id: id(), kod, body: k.map((p) => ({ ...p })), rozestup: r?.rozestup ?? 1.2,
        }));
      }
    }
    st.getState().set('koncept', []);
    setPresna(null);
  }, [st]);

  const smazVybrane = useCallback(() => {
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
      else if (v.typ === 'kota') d.koty = d.koty.filter((x) => x.id !== v.id);
    });
    st.getState().set('vyber', null);
  }, [st]);

  // ------------------------------------------------------------- klavesy
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const cil = e.target as HTMLElement;
      if (cil && (cil.tagName === 'INPUT' || cil.tagName === 'TEXTAREA' || cil.isContentEditable)) return;
      if (e.key === 'Enter') { dokonci(); e.preventDefault(); }
      else if (e.key === 'Escape') { st.getState().set('koncept', []); setPresna(null); setRez(null); }
      else if (e.key === 'Backspace' && st.getState().koncept.length) {
        st.getState().set('koncept', st.getState().koncept.slice(0, -1)); e.preventDefault();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.getState().vpred(); else st.getState().zpet();
      }
      else if (e.key === 'Delete') smazVybrane();
      else if (/^[0-9]$/.test(e.key) && st.getState().koncept.length && !presna) {
        setPresna({ d: e.key, u: '' });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dokonci, presna, smazVybrane, st]);

  /** Presne zadani delky/uhlu pri kresleni. */
  const potvrdPresnou = () => {
    if (!presna || !koncept.length) return;
    const d = parseFloat(presna.d.replace(',', '.'));
    if (!(d > 0)) { setPresna(null); return; }
    const a = koncept[koncept.length - 1];
    const smer = presna.u !== ''
      ? (parseFloat(presna.u.replace(',', '.')) * Math.PI) / 180
      : Math.atan2((mys?.y ?? a.y) - a.y, (mys?.x ?? a.x) - a.x);
    st.getState().set('koncept', [...koncept, { x: a.x + Math.cos(smer) * d, y: a.y + Math.sin(smer) * d }]);
    setPresna(null);
  };

  // -------------------------------------------------------------- vykresli
  const barvaPlosky = (p: Ploska) => {
    if (zobrazeni === 'vysky') return p.uroven ? UROVNE[p.uroven].barva : BARVA_PRAZDNA;
    const r = rostlina(p.kod);
    return r ? (kategorie[r.kat]?.fill ?? BARVA_PRAZDNA) : BARVA_PRAZDNA;
  };

  const vybranaPloska = vyber?.typ === 'ploska' ? vyber : null;
  const podklad = pr.podklad;

  return (
    <div
      ref={box}
      className="relative h-full w-full overflow-hidden bg-white select-none"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: nastroj === 'vyber' ? 'default' : 'crosshair' }}
    >
      {/* 1. vrstva - vybarveni zahonu (pod rastrem podkladu) */}
      <svg className="absolute inset-0" width={W} height={H}>
        <g transform={gt}>
          {tvary.map((t) => t.plosky.map(({ p }) => (
            <path key={p.id} d={cesta(p.ring)} fill={barvaPlosky(p)}
              fillOpacity={zobrazeni === 'vysky' ? 0.55 : 1} />
          )))}
        </g>
      </svg>

      {/* 2. vrstva - podklad; nasobenim zmizi bila a zustane cyan rastr */}
      {podklad && podkladUrl && (
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-kamera.x}px, ${-kamera.y}px)`, pointerEvents: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="podklad"
            src={podkladUrl}
            className="absolute origin-top-left"
            style={{
              left: 0, top: 0,
              // obrazek si drzi vlastni rozliseni a zmensuje se az transformaci,
              // jinak by ho prohlizec rasterizoval na par pixelu a rastr by se rozmazal
              width: `${podklad.pxW || 1000}px`, height: `${podklad.pxH || 1000}px`,
              // bez tohohle by preflight (max-width:100%) obrazek zmackl na sirku okna
              maxWidth: 'none', maxHeight: 'none',
              transform: `translate(${podklad.x}px, ${podklad.y}px) rotate(${podklad.otoceni}deg) scale(${podklad.sirkaM / (podklad.pxW || 1000)})`,
              mixBlendMode: 'multiply',
              opacity: podklad.kryti,
            }}
          />
        </div>
      )}

      {/* 3. vrstva - cary, keře, stromy a popisky (nad rastrem) */}
      <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
        <g transform={gt}>
          {/* hranice plosek */}
          {tvary.map((t) => t.plosky.map(({ p }) => (
            <path key={p.id} d={cesta(p.ring)} fill="none" stroke="#7a7a7a" strokeWidth={0.8}
              vectorEffect="non-scaling-stroke" />
          )))}

          {/* obrys zahonu */}
          {tvary.map((t) => t.obrys.map((o, i) => (
            <path key={t.zh.id + i} d={cesta(o.map((q) => ({ x: q.x, y: q.y })))} fill="none"
              stroke={OBRYS_ZAHONU} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )))}

          {/* skupiny keru */}
          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const body = naBody(s.body, 0.02, false);
            const tecky = bodyPoCare(body, s.rozestup ?? r?.rozestup ?? 1.2);
            return (
              <g key={s.id}>
                <polyline points={body.map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
                  stroke="#1a1a1a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                {tecky.map((q, i) => (
                  <circle key={i} cx={q.x} cy={q.y} r={(r?.koruna ?? 1.5) / 2} fill={kategorie[r?.kat ?? 'K']?.fill ?? '#d9edd1'}
                    fillOpacity={0.35} stroke="#1a1a1a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                ))}
                {tecky.map((q, i) => <circle key={'d' + i} cx={q.x} cy={q.y} r={0.12} fill="#1a1a1a" />)}
              </g>
            );
          })}

          {/* stromy a solitery */}
          {pr.solitery.map((s) => {
            const r = rostlina(s.kod);
            const kr = (s.koruna ?? r?.koruna ?? 4) / 2;
            return (
              <g key={s.id}>
                <circle cx={s.pos.x} cy={s.pos.y} r={kr} fill="none" stroke="#1a1a1a" strokeWidth={1}
                  vectorEffect="non-scaling-stroke" />
                <circle cx={s.pos.x} cy={s.pos.y} r={0.25} fill="#1a1a1a" />
                {s.vicekmen && <circle cx={s.pos.x} cy={s.pos.y} r={0.5} fill="none" stroke="#1a1a1a"
                  strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              </g>
            );
          })}

          {/* rozkreslene */}
          {koncept.length > 0 && (
            <>
              <polyline
                points={[...koncept, ...(mys ? [mys] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke="#0a7" strokeWidth={2} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
              {koncept.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / z} fill="#0a7" />)}
            </>
          )}
          {rez && rez.length > 1 && (
            <polyline points={rez.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#d33"
              strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          )}

          {/* uchopove body vybrane plosky */}
          {vybranaPloska && (() => {
            const pl = pr.zahony.find((x) => x.id === vybranaPloska.zahon)?.plosky.find((x) => x.id === vybranaPloska.ploska);
            if (!pl) return null;
            return (
              <g>
                <path d={cesta(pl.ring)} fill="none" stroke="#0a7" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                {pl.ring.map((v, i) => <rect key={i} x={v.x - 4 / z} y={v.y - 4 / z} width={8 / z} height={8 / z} fill="#fff" stroke="#0a7" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
                {pl.ring.map((v, i) => {
                  const s = stredHrany(v, pl.ring[(i + 1) % pl.ring.length]);
                  return <circle key={'s' + i} cx={s.x} cy={s.y} r={3.5 / z} fill="#0a7" opacity={0.75} />;
                })}
              </g>
            );
          })()}

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
        </g>

        {/* --- texty v obrazovych souradnicich, aby nemenily velikost --- */}
        <g>
          {tvary.map((t) => t.plosky.map(({ p, popisek }) => {
            const vysky = zobrazeni === 'vysky';
            const text = vysky ? (p.uroven ? UROVNE[p.uroven].kratce : '') : popisekPlosky(p, rostlina(p.kod));
            if (!text) return null;
            const c = naObraz(add(popisek, p.popisek ?? { x: 0, y: 0 }));
            return (
              <text key={p.id} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={600} fill={vysky ? '#333' : '#111'}
                stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                {text}
              </text>
            );
          }))}

          {pr.skupiny.map((s) => {
            const r = rostlina(s.kod);
            const stred = s.body[Math.floor(s.body.length / 2)];
            const c = naObraz(add(stred, s.popisek ?? { x: 0, y: -1.2 }));
            const k = naObraz(stred);
            return (
              <g key={s.id}>
                <line x1={c.x} y1={c.y + 4} x2={k.x} y2={k.y} stroke="#1a1a1a" strokeWidth={0.6} opacity={0.6} />
                <text x={c.x} y={c.y} textAnchor="middle" fontSize={11} fontStyle="italic" fill="#111"
                  stroke="#fff" strokeWidth={3} paintOrder="stroke">{r?.latin ?? s.kod}</text>
              </g>
            );
          })}

          {pr.solitery.map((s) => {
            const r = rostlina(s.kod);
            const c = naObraz(add(s.pos, s.popisek ?? { x: 0, y: -1.2 }));
            const k = naObraz(s.pos);
            return (
              <g key={s.id}>
                <line x1={c.x} y1={c.y + 4} x2={k.x} y2={k.y} stroke="#1a1a1a" strokeWidth={0.6} opacity={0.6} />
                <text x={c.x} y={c.y} textAnchor="middle" fontSize={11.5} fontStyle="italic" fontWeight={500} fill="#111"
                  stroke="#fff" strokeWidth={3} paintOrder="stroke">{r?.latin ?? s.kod}</text>
              </g>
            );
          })}

          {pr.ukazKoty && pr.koty.map((k) => {
            const smer = norm(sub(k.b, k.a));
            const n = { x: -smer.y, y: smer.x };
            const c = naObraz(add(lerp(k.a, k.b, 0.5), mul(n, k.odsazeni)));
            return (
              <text key={k.id} x={c.x} y={c.y - 4} textAnchor="middle" fontSize={11} fill="#0a7"
                stroke="#fff" strokeWidth={3} paintOrder="stroke">{dist(k.a, k.b).toFixed(2)} m</text>
            );
          })}

          {/* delka rozkreslene hrany */}
          {koncept.length > 0 && mys && (() => {
            const a = koncept[koncept.length - 1];
            const c = naObraz(lerp(a, mys, 0.5));
            const d = dist(a, mys);
            const u = (Math.atan2(mys.y - a.y, mys.x - a.x) * 180) / Math.PI;
            return (
              <text x={c.x + 8} y={c.y - 8} fontSize={12} fill="#0a7" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {d.toFixed(2)} m / {(((u % 360) + 360) % 360).toFixed(0)}°
              </text>
            );
          })()}
        </g>
      </svg>

      {/* presne zadani */}
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

      {/* stavovy radek */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-gray-600 shadow">
        {mys ? `${mys.x.toFixed(2)} ; ${mys.y.toFixed(2)} m` : '—'} · {z.toFixed(0)} px/m
        {nastroj !== 'vyber' && ' · Enter uzavře, Esc zruší, Shift = úhel po 45°, číslicí zadáš přesnou délku'}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pomocne
function najdiPlosku(zahony: Zahon[], zid: string, pid: string): Ploska | undefined {
  return zahony.find((z) => z.id === zid)?.plosky.find((p) => p.id === pid);
}

function stredHrany(a: V, b: V): P {
  if (!a.b) return lerp(a, b, 0.5);
  const d = dist(a, b);
  const n = { x: -(b.y - a.y) / (d || 1), y: (b.x - a.x) / (d || 1) };
  return add(lerp(a, b, 0.5), mul(n, (a.b * d) / 2));
}

function vzdalOdUsecky(p: P, a: P, b: P) {
  const ab = sub(b, a), ap = sub(p, a);
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return dist(p, add(a, mul(ab, t)));
}
