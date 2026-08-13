/**
 * Rozvrh zahonu.
 *
 * Uzivatel neobkresluje plochu pro kazdou rostlinu. Jen obtahne obrys zahonu,
 * zhruba do nej nacrtne tahy pro vyskove oblasti a vybere, ktere rostliny tam
 * maji byt. Zbytek dela tenhle soubor.
 *
 * Plochy vznikaji jako **mocninny (vazeny) Voronoiuv diagram**: kazda rostlina
 * ma v zahonu jedno nebo vic semen a plocha pripadne tomu nejblizsimu. Hranice
 * mezi dvema semeny je primka, takze plosky vychazeji hranate a na sebe presne
 * navazuji - jako na rucne kreslenych planech. Vahy semen se pak iterativne
 * dolaďuji, dokud plochy neodpovidaji zadanym podilum.
 */
import {
  P, bodProPopisek, bodVPolygonu, naBody, obalka, plochaBodu, vzdalUsecka, zjednodus,
} from './geom';
import { Osazeni, PORADI_UROVNI, Rostlina, Uroven, Zahon, autoSkupin, urovenRostliny } from './model';

export type Cast = {
  id: string;
  kod?: string;
  uroven?: Uroven;
  polygon: P[];
  plocha: number;
  kusu: number;
  popisek: P;
};

export type Rozvrh = {
  casti: Cast[];
  /** Plocha zahonu v m2. */
  plocha: number;
  nevyuzito: number;
};

const PRAZDNY: Rozvrh = { casti: [], plocha: 0, nevyuzito: 0 };

/** Deterministicky generator - stejne semeno da stejne rozvrzeni. */
function nahoda(semeno: number) {
  let a = semeno >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Semeno = { rostlina: number; x: number; y: number; vaha: number; cil: number };

export function rozvrhni(z: Zahon, db: Map<string, Rostlina>): Rozvrh {
  const obrys = zjednodus(naBody(z.obrys, 0.02), 0.01);
  if (obrys.length < 3) return PRAZDNY;
  const plochaZahonu = plochaBodu(obrys);
  if (plochaZahonu < 0.05) return PRAZDNY;

  const osazeni = z.osazeni.filter((x) => db.has(x.kod));
  if (!osazeni.length) return { casti: [], plocha: plochaZahonu, nevyuzito: plochaZahonu };

  const semena = rozsejSemena(z, obrys, plochaZahonu, osazeni, db);
  if (!semena.length) return { casti: [], plocha: plochaZahonu, nevyuzito: plochaZahonu };

  doladVahy(obrys, semena);

  const casti: Cast[] = [];
  const polygony = mocninneBunky(obrys, semena);
  polygony.forEach((polygon, i) => {
    if (polygon.length < 3) return;
    const plocha = plochaBodu(polygon);
    if (plocha < 0.05) return;
    const { kod } = osazeni[semena[i].rostlina];
    const r = db.get(kod);
    casti.push({
      id: `${z.id}-${kod}-${i}`,
      kod,
      uroven: r ? urovenRostliny(r.vyska) : undefined,
      polygon,
      plocha,
      kusu: Math.max(1, Math.round(plocha * (r?.hustota ?? 5))),
      popisek: bodProPopisek(polygon),
    });
  });

  return { casti, plocha: plochaZahonu, nevyuzito: 0 };
}

// ------------------------------------------------------------- rozseti semen

/**
 * Semena se rozhazuji co nejdal od sebe, ale prednostne do te vyskove oblasti,
 * ktera odpovida vysce jejich rostliny. Oblasti tim rostliny jen pritahuji -
 * hranice zustava mekka, jak ma byt.
 */
function rozsejSemena(
  z: Zahon, obrys: P[], plochaZahonu: number, osazeni: Osazeni[], db: Map<string, Rostlina>,
): Semeno[] {
  const rnd = nahoda(z.semeno);

  // hruby rastr kandidatu na umisteni semen
  const o = obalka(obrys);
  const krok = Math.max(0.15, Math.sqrt(plochaZahonu / 900));
  const kandidati: { x: number; y: number; uroven: Uroven | null }[] = [];
  const tahy = z.vysky.filter((t) => t.body.length >= 1);
  for (let y = o.y0 + krok / 2; y < o.y1; y += krok) {
    for (let x = o.x0 + krok / 2; x < o.x1; x += krok) {
      if (!bodVPolygonu({ x, y }, obrys)) continue;
      let uroven: Uroven | null = null;
      if (tahy.length) {
        let nej = Infinity;
        for (const t of tahy) {
          const d = vzdalOdTahu({ x, y }, t.body);
          if (d < nej) { nej = d; uroven = t.uroven; }
        }
      }
      kandidati.push({ x, y, uroven });
    }
  }
  if (!kandidati.length) return [];

  const soucet = osazeni.reduce((a, x) => a + Math.max(0.01, x.podil), 0);
  const semena: Semeno[] = [];
  for (let i = 0; i < osazeni.length; i++) {
    const podil = Math.max(0.01, osazeni[i].podil) / soucet;
    const pocet = Math.max(1, Math.min(8, osazeni[i].skupin ?? autoSkupin(podil, plochaZahonu)));
    const cil = (podil * plochaZahonu) / pocet;
    for (let s = 0; s < pocet; s++) semena.push({ rostlina: i, x: 0, y: 0, vaha: 0, cil });
  }

  const urovenCile = osazeni.map((x) => urovenRostliny(db.get(x.kod)!.vyska));
  /** Cim dal je bunka od "sve" oblasti, tim mene je pro semeno vhodna. */
  const vhodnost = (k: number, s: number) => {
    const u = kandidati[k].uroven;
    if (!u) return 1;
    const rozdil = Math.abs(PORADI_UROVNI.indexOf(u) - PORADI_UROVNI.indexOf(urovenCile[semena[s].rostlina]));
    return 1 / (1 + rozdil * 2.5);
  };

  const vzdal = new Float64Array(kandidati.length).fill(Infinity);
  for (let s = 0; s < semena.length; s++) {
    let nejI = 0, nejS = -1;
    for (let k = 0; k < kandidati.length; k++) {
      if (s > 0) {
        const p = kandidati[k], q = semena[s - 1];
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < vzdal[k]) vzdal[k] = d;
      }
      const zaklad = s === 0 ? 1 : vzdal[k];
      const skore = zaklad * vhodnost(k, s) * (0.85 + rnd() * 0.3);
      if (skore > nejS) { nejS = skore; nejI = k; }
    }
    semena[s].x = kandidati[nejI].x;
    semena[s].y = kandidati[nejI].y;
    vzdal[nejI] = 0;
  }
  return semena;
}

function vzdalOdTahu(p: P, body: P[]): number {
  if (body.length === 1) return Math.hypot(p.x - body[0].x, p.y - body[0].y);
  let nej = Infinity;
  for (let i = 1; i < body.length; i++) nej = Math.min(nej, vzdalUsecka(p, body[i - 1], body[i]));
  return nej;
}

// -------------------------------------------------------- mocninny diagram

/**
 * Orez polygonu polorovinou bodu blizsich k `a` nez k `b` (v mocninne metrice).
 * Hranice je primka, proto vychazeji rovne hrany.
 */
function orezPolorovinou(poly: P[], a: Semeno, b: Semeno): P[] {
  const nx = 2 * (b.x - a.x);
  const ny = 2 * (b.y - a.y);
  const c = (b.x * b.x + b.y * b.y) - (a.x * a.x + a.y * a.y) - (b.vaha - a.vaha);
  if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12) return c >= 0 ? poly : [];

  const uvnitr = (p: P) => nx * p.x + ny * p.y <= c;
  const prusecik = (p: P, q: P): P => {
    const dp = nx * p.x + ny * p.y - c;
    const dq = nx * q.x + ny * q.y - c;
    const t = dp / (dp - dq);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };

  const out: P[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j], q = poly[i];
    const pIn = uvnitr(p), qIn = uvnitr(q);
    if (pIn && qIn) out.push(q);
    else if (pIn && !qIn) out.push(prusecik(p, q));
    else if (!pIn && qIn) { out.push(prusecik(p, q)); out.push(q); }
  }
  return out.length >= 3 ? out : [];
}

function mocninneBunky(obrys: P[], semena: Semeno[]): P[][] {
  return semena.map((s, i) => {
    let poly = obrys;
    for (let j = 0; j < semena.length && poly.length >= 3; j++) {
      if (i !== j) poly = orezPolorovinou(poly, s, semena[j]);
    }
    return poly.length >= 3 ? zjednodus(poly, 0.004) : [];
  });
}

/**
 * Doladi vahy semen tak, aby plochy odpovidaly zadanym podilum. Zvyseni vahy
 * posune hranice od semene ven, takze jeho ploska roste na ukor sousedu.
 */
function doladVahy(obrys: P[], semena: Semeno[]) {
  if (semena.length < 2) return;

  const chybaVah = () => {
    const bunky = mocninneBunky(obrys, semena);
    const plochy = bunky.map((b) => (b.length >= 3 ? plochaBodu(b) : 0));
    const nejhorsi = plochy.reduce((a, p, i) => Math.max(a, Math.abs(semena[i].cil - p) / semena[i].cil), 0);
    return { plochy, nejhorsi };
  };

  let krok = 0.5;
  let { plochy, nejhorsi } = chybaVah();
  let nejlepsi = { chyba: nejhorsi, vahy: semena.map((s) => s.vaha) };

  for (let iter = 0; iter < 120 && nejhorsi > 0.02; iter++) {
    const puvodni = semena.map((s) => s.vaha);
    for (let i = 0; i < semena.length; i++) semena[i].vaha += krok * (semena[i].cil - plochy[i]);
    // vahy jsou relativni, drz je kolem nuly, at cisla neutikaji
    const prumer = semena.reduce((a, s) => a + s.vaha, 0) / semena.length;
    for (const s of semena) s.vaha -= prumer;

    const dalsi = chybaVah();
    if (dalsi.nejhorsi > nejhorsi) {
      // prestrelili jsme - vrat se a zkracuj krok
      semena.forEach((s, i) => { s.vaha = puvodni[i]; });
      krok *= 0.6;
      if (krok < 1e-3) break;
      continue;
    }
    plochy = dalsi.plochy;
    nejhorsi = dalsi.nejhorsi;
    if (nejhorsi < nejlepsi.chyba) nejlepsi = { chyba: nejhorsi, vahy: semena.map((s) => s.vaha) };
  }

  semena.forEach((s, i) => { s.vaha = nejlepsi.vahy[i]; });
}
