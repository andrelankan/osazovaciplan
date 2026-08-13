/** Male ulozište pro podklady (PDF/obrazky) - do localStorage by se nevešly. */
const DB = 'osazovaci-plan';
const STORE = 'podklady';

function otevri(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function tx(mode: IDBTransactionMode) {
  const db = await otevri();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function uloz(klic: string, hodnota: Blob | string) {
  const s = await tx('readwrite');
  return new Promise<void>((res, rej) => {
    const r = s.put(hodnota, klic);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function nacti<T = Blob | string>(klic: string): Promise<T | undefined> {
  const s = await tx('readonly');
  return new Promise((res, rej) => {
    const r = s.get(klic);
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}

export async function smaz(klic: string) {
  const s = await tx('readwrite');
  return new Promise<void>((res) => { const r = s.delete(klic); r.onsuccess = () => res(); });
}
