'use client';
import { Podklad } from './model';
import { uloz } from './idb';

/** Sirka rastrovaneho podkladu v pixelech - kompromis ostrost / velikost. */
const CIL_PX = 3200;

export type Vysledek = { podklad: Podklad; url: string };

/**
 * Z bileho pozadi vykresu udela pruhledno, cary zustanou.
 *
 * Bez toho by podklad prekryl vybarveni zahonu: rezim "nasobeni" v CSS blenduje
 * jen v ramci sveho stohovaciho kontextu, a ten kvuli transformaci platna vznika
 * nad vrstvou s vyplnemi. S opravdovou pruhlednosti na tom uz nezalezi.
 */
function zpruhledniBilou(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const obraz = ctx.getImageData(0, 0, w, h);
  const d = obraz.data;
  for (let i = 0; i < d.length; i += 4) {
    // nejsvetlejsi slozka urcuje, jak moc je pixel "bily"
    const nej = Math.min(d[i], d[i + 1], d[i + 2]);
    d[i + 3] = 255 - nej;
  }
  ctx.putImageData(obraz, 0, 0);
}

/**
 * Nacte PDF nebo obrazek jako podklad.
 * U PDF se skutecna velikost spocita z rozmeru stranky a meritka (1:`meritko`).
 * U obrazku se sirka odhadne na 20 m a upresni se nastrojem Kalibrace.
 */
export async function nactiPodklad(file: File, meritko: number, stranka = 1): Promise<Vysledek> {
  const klic = 'podklad-' + Date.now().toString(36);

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const cislo = Math.min(Math.max(1, stranka), doc.numPages);
    const page = await doc.getPage(cislo);

    const zaklad = page.getViewport({ scale: 1 });          // rozmery v bodech (1/72")
    const sirkaM = (zaklad.width / 72) * 0.0254 * meritko;
    const vyskaM = (zaklad.height / 72) * 0.0254 * meritko;

    const scale = Math.min(6, CIL_PX / zaklad.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    zpruhledniBilou(ctx, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    await uloz(klic, blob);
    return {
      url: URL.createObjectURL(blob),
      podklad: {
        nazev: file.name, typ: 'pdf', klic, sirkaM, vyskaM,
        pxW: canvas.width, pxH: canvas.height,
        x: 0, y: 0, otoceni: 0, kryti: 1, meritko, stranka: cislo,
      },
    };
  }

  // rastrovy obrazek
  const blob = file.slice();
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  await uloz(klic, blob);
  const sirkaM = 20;
  return {
    url,
    podklad: {
      nazev: file.name, typ: 'obraz', klic, sirkaM,
      vyskaM: (img.naturalHeight / img.naturalWidth) * sirkaM,
      pxW: img.naturalWidth, pxH: img.naturalHeight,
      x: 0, y: 0, otoceni: 0, kryti: 1,
    },
  };
}

export async function pocetStranek(file: File): Promise<number> {
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return 1;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return doc.numPages;
}
