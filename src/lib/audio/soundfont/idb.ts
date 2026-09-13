const DB_NAME = "fuwari-soundfonts";
const STORE = "sf2";
const DB_VER = 1;
const ACTIVE_KEY = "fuwari.soundfont.active";

export type StoredSoundfont = {
  id: string;
  label: string;
  buffer: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB を開けません"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB エラー"));
  });
}

export async function idbPut(font: StoredSoundfont) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(font, font.id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("保存に失敗"));
  });
  db.close();
}

export async function idbGet(id: string): Promise<StoredSoundfont | null> {
  const db = await openDb();
  const row = await reqToPromise(
    db.transaction(STORE, "readonly").objectStore(STORE).get(id),
  );
  db.close();
  return (row as StoredSoundfont | undefined) ?? null;
}

export async function idbDelete(id: string) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("削除に失敗"));
  });
  db.close();
}

export async function idbListIds(): Promise<string[]> {
  const db = await openDb();
  const keys = await reqToPromise(
    db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys(),
  );
  db.close();
  return (keys as IDBValidKey[]).map(String);
}

export function readActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* quota / private mode */
  }
}
