import polygonClipping from 'polygon-clipping';

/** Svet je v metrech, osa y roste dolu (jako na papire). */
export type P = { x: number; y: number };
/** Vrchol prstence. `b` = bulge (vydutí) hrany k NASLEDUJICIMU vrcholu, jako v DXF. */
export type V = P & { b?: number };
export type Ring = V[];

export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
export const len = (a: P) => Math.hypot(a.x, a.y);
export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
/** Kolmice vlevo od smeru. */
export const perp = (a: P): P => ({ x: -a.y, y: a.x });
export const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Uhel hrany ve stupnich, 0 = doprava, roste po smeru hodinovych rucicek (y dolu). */
export const uhel = (a: P, b: P) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

// ---------------------------------------------------------------- oblouky

export type Oblouk = { c: P; r: number; a1: number; a2: number; ccw: boolean };

/** Geometrie oblouku mezi dvema body pro dane bulge. */
export function oblouk(p1: P, p2: P, b?: number): Oblouk | null {
  if (!b || Math.abs(b) < 1e-6) return null;
  const d = dist(p1, p2);
  if (d < 1e-9) return null;
  const s = (b * d) / 2;                       // vyska usece
  const r = (d * (1 + b * b)) / (4 * Math.abs(b));
  const m = lerp(p1, p2, 0.5);
  const n = perp(norm(sub(p2, p1)));
  const t = -Math.sign(s) * (r - Math.abs(s));
  const c = add(m, mul(n, t));
  return {
    c, r,
    a1: Math.atan2(p1.y - c.y, p1.x - c.x),
    a2: Math.atan2(p2.y - c.y, p2.x - c.x),
    ccw: b < 0,
  };
}

/** Bulge z bodu na oblouku (pro tazeni hrany mysi). */
export function bulgeZBodu(p1: P, p2: P, pt: P): number {
  const d = dist(p1, p2);
  if (d < 1e-9) return 0;
  const n = perp(norm(sub(p2, p1)));
  const m = lerp(p1, p2, 0.5);
  const s = (pt.x - m.x) * n.x + (pt.y - m.y) * n.y;   // prumet na kolmici
  const b = (2 * s) / d;
  return Math.max(-4, Math.min(4, b));
}

/** Delka hrany vcetne oblouku. */
export function delkaHrany(p1: P, p2: P, b?: number): number {
  const o = oblouk(p1, p2, b);
  if (!o) return dist(p1, p2);
  const theta = 4 * Math.atan(Math.abs(b!));
  return o.r * theta;
}

// ---------------------------------------------------------- prstenec <-> body

/** Rozlozi prstenec (vcetne oblouku) na lomenou caru. `tol` = max. odchylka v metrech. */
export function naBody(ring: Ring, tol = 0.01, uzavrit = true): P[] {
  const out: P[] = [];
  const n = ring.length;
  if (!n) return out;
  const posledni = uzavrit ? n : n - 1;
  for (let i = 0; i < posledni; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    out.push({ x: p1.x, y: p1.y });
    const o = oblouk(p1, p2, p1.b);
    if (!o) continue;
    const theta = Math.abs(4 * Math.atan(p1.b!));
    const krokUhlu = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / o.r)));
    const kroku = Math.max(2, Math.min(180, Math.ceil(theta / (krokUhlu || 0.2))));
    for (let k = 1; k < kroku; k++) {
      const a = uhlyRozsah(o, k / kroku);
      out.push({ x: o.c.x + o.r * Math.cos(a), y: o.c.y + o.r * Math.sin(a) });
    }
  }
  if (!uzavrit) out.push({ x: ring[n - 1].x, y: ring[n - 1].y });
  return out;
}

/** Interpolace uhlu po oblouku ve spravnem smeru. */
function uhlyRozsah(o: Oblouk, t: number) {
  let d = o.a2 - o.a1;
  if (o.ccw) { while (d > 0) d -= 2 * Math.PI; }
  else { while (d < 0) d += 2 * Math.PI; }
  return o.a1 + d * t;
}

/**
 * SVG path prstence.
 *
 * Zamerne se kresli z rozlozene lomene cary, ne pres SVG prikaz `A`: vypln,
 * obrys, vypocet plochy i chytani mysi tak pracuji s uplne stejnymi body.
 * Kdyz se to rozchazelo, delaly ohnute strany pri uprave zahonu falesne tvary.
 */
export function cesta(ring: Ring, uzavrit = true): string {
  if (!ring.length) return '';
  return cestaBody(naBody(ring, 0.008, uzavrit), uzavrit);
}

/** SVG path z hotovych bodu. */
export function cestaBody(body: P[], uzavrit = true): string {
  if (!body.length) return '';
  let d = `M ${body[0].x.toFixed(3)} ${body[0].y.toFixed(3)}`;
  for (let i = 1; i < body.length; i++) d += ` L ${body[i].x.toFixed(3)} ${body[i].y.toFixed(3)}`;
  return uzavrit ? d + ' Z' : d;
}

// ---------------------------------------------------------------- plocha

export function plochaBodu(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a / 2);
}

export const plocha = (ring: Ring) => plochaBodu(naBody(ring, 0.005));

export function teziste(pts: P[]): P {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a += f; cx += (pts[j].x + pts[i].x) * f; cy += (pts[j].y + pts[i].y) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return mul(s, 1 / Math.max(1, pts.length));
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function obalka(pts: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function bodVPolygonu(pt: P, pts: P[]): boolean {
  let uvnitr = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) uvnitr = !uvnitr;
  }
  return uvnitr;
}

/** Vzdalenost bodu od usecky. */
export function vzdalUsecka(p: P, a: P, b: P): number {
  const ab = sub(b, a), ap = sub(p, a);
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return dist(p, add(a, mul(ab, t)));
}

function vzdalenostOdHrany(pt: P, pts: P[]): number {
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    const ab = sub(b, a), ap = sub(pt, a);
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    min = Math.min(min, dist(pt, add(a, mul(ab, t))));
  }
  return min;
}

/**
 * Bod nejlepe uvnitr polygonu (pol najvetsi vepsane kruznice) - pro umisteni popisku,
 * aby text nevypadl z uzke nebo prohnute plochy jako u teziste.
 */
export function bodProPopisek(pts: P[]): P {
  const o = obalka(pts);
  const krok = Math.max(o.w, o.h) / 24 || 1;
  let nej: P = teziste(pts);
  let nejD = bodVPolygonu(nej, pts) ? vzdalenostOdHrany(nej, pts) : -1;
  for (let y = o.y0 + krok / 2; y < o.y1; y += krok) {
    for (let x = o.x0 + krok / 2; x < o.x1; x += krok) {
      const p = { x, y };
      if (!bodVPolygonu(p, pts)) continue;
      const d = vzdalenostOdHrany(p, pts);
      if (d > nejD) { nejD = d; nej = p; }
    }
  }
  // dva kroky zjemneni
  let r = krok;
  for (let iter = 0; iter < 2; iter++) {
    r /= 3;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = { x: nej.x + dx * r, y: nej.y + dy * r };
      if (!bodVPolygonu(p, pts)) continue;
      const d = vzdalenostOdHrany(p, pts);
      if (d > nejD) { nejD = d; nej = p; }
    }
  }
  return nej;
}

// ------------------------------------------------------- booleovske operace

type PC = [number, number][][];
const doPC = (pts: P[]): PC => [[...pts.map((p) => [p.x, p.y] as [number, number]), [pts[0].x, pts[0].y]]];
const zPC = (mp: number[][][][]): P[][] =>
  mp.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y }))).filter((r) => r.length >= 3);

/** Odstrani skoro totozne a kolinearni body. */
export function zjednodus(pts: P[], tol = 0.004): P[] {
  const out: P[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > tol) out.push(p);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= tol) out.pop();
  const vys: P[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const kriz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(kriz) > tol * dist(a, c) * 0.5) vys.push(b);
  }
  return vys.length >= 3 ? vys : out;
}

/**
 * Rozdeli polygon rezem (lomenou carou). Rez se automaticky prodlouzi za okraje,
 * takze staci tahnout zhruba pres tvar.
 */
export function rozdel(pts: P[], rez: P[]): P[][] {
  if (rez.length < 2) return [pts];
  // prodlouzeni jen o rozmer tvaru - aby rez neprojel i pres vzdalene zahony
  const o = obalka(pts);
  const L = Math.hypot(o.w, o.h) * 1.5 + 1;
  const d0 = norm(sub(rez[0], rez[1]));
  const dn = norm(sub(rez[rez.length - 1], rez[rez.length - 2]));
  const cara = [add(rez[0], mul(d0, L)), ...rez, add(rez[rez.length - 1], mul(dn, L))];

  // pas: cara posunuta o velkou vzdalenost na jednu stranu
  const normaly: P[] = cara.map((_, i) => {
    const a = cara[Math.max(0, i - 1)], b = cara[Math.min(cara.length - 1, i + 1)];
    return perp(norm(sub(b, a)));
  });
  const pas = [...cara, ...cara.map((p, i) => add(p, mul(normaly[i], L))).reverse()];

  try {
    const A = zPC(polygonClipping.intersection(doPC(pts) as never, doPC(pas) as never) as never);
    const B = zPC(polygonClipping.difference(doPC(pts) as never, doPC(pas) as never) as never);
    const kusy = [...A, ...B].map((r) => zjednodus(r)).filter((r) => r.length >= 3 && plochaBodu(r) > 0.02);
    return kusy.length >= 2 ? kusy : [pts];
  } catch {
    return [pts];
  }
}

function usecky(a: P, b: P, c: P, d: P): boolean {
  const t = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return t(a, b, c) !== t(a, b, d) && t(c, d, a) !== t(c, d, b);
}

/** Prochazi nakresleny rez opravdu tímto tvarem? Bez toho by rez krajel i sousedni zahony. */
export function protina(pts: P[], rez: P[]): boolean {
  for (const p of rez) if (bodVPolygonu(p, pts)) return true;
  for (let i = 1; i < rez.length; i++)
    for (let j = 0, k = pts.length - 1; j < pts.length; k = j++)
      if (usecky(rez[i - 1], rez[i], pts[k], pts[j])) return true;
  return false;
}

/** Sjednoceni vice polygonu (obrys zahonu z jednotlivych plosek). */
export function sjednot(polygony: P[][]): P[][] {
  if (!polygony.length) return [];
  try {
    const res = polygonClipping.union(doPC(polygony[0]) as never, ...(polygony.slice(1).map((p) => doPC(p)) as never[]));
    return zPC(res as never);
  } catch {
    return polygony;
  }
}

/** Prunik (orez plosky obrysem zahonu). */
export function prunik(a: P[], b: P[]): P[][] {
  try { return zPC(polygonClipping.intersection(doPC(a) as never, doPC(b) as never) as never).map((r) => zjednodus(r)); }
  catch { return [a]; }
}

/** Rozdil. */
export function rozdil(a: P[], b: P[]): P[][] {
  try { return zPC(polygonClipping.difference(doPC(a) as never, doPC(b) as never) as never).map((r) => zjednodus(r)); }
  catch { return [a]; }
}

// ------------------------------------------------------------- rozmisteni

/** Body rovnomerne po lomene care (skupiny keru). */
export function bodyPoCare(pts: P[], rozestup: number): P[] {
  if (pts.length < 2 || rozestup <= 0) return pts.slice();
  let celkem = 0;
  for (let i = 1; i < pts.length; i++) celkem += dist(pts[i - 1], pts[i]);
  const pocet = Math.max(2, Math.round(celkem / rozestup) + 1);
  const krok = celkem / (pocet - 1);
  const out: P[] = [pts[0]];
  let i = 1, zbyva = krok;
  let akt = pts[0];
  while (i < pts.length && out.length < pocet) {
    const d = dist(akt, pts[i]);
    if (d >= zbyva) {
      akt = lerp(akt, pts[i], zbyva / d);
      out.push(akt);
      zbyva = krok;
    } else {
      zbyva -= d; akt = pts[i]; i++;
    }
  }
  if (out.length < pocet) out.push(pts[pts.length - 1]);
  return out;
}

/** Trojuhelnikovy rastr sazenic uvnitr plochy - pro zobrazeni jednotlivych rostlin. */
export function rastrVPloše(pts: P[], hustota: number, max = 400): P[] {
  if (hustota <= 0) return [];
  const o = obalka(pts);
  const krok = Math.sqrt(1 / hustota);
  const out: P[] = [];
  const radky = Math.ceil(o.h / (krok * 0.866)) + 1;
  for (let r = 0; r <= radky && out.length < max; r++) {
    const y = o.y0 + r * krok * 0.866;
    const posun = r % 2 ? krok / 2 : 0;
    for (let x = o.x0 + posun; x <= o.x1 && out.length < max; x += krok) {
      const p = { x: x + krok / 2, y: y + krok / 4 };
      if (bodVPolygonu(p, pts)) out.push(p);
    }
  }
  return out;
}
