const DB_NAME = "fuwari-ai-voice-v1";
const STORE = "files";

type Rec = { name: string; type: string; blob: Blob };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistVoiceModel(id: string, file: File | null) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (!file) tx.objectStore(STORE).delete(id);
    else tx.objectStore(STORE).put({ name: file.name, type: file.type, blob: file } satisfies Rec, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadVoiceModel(id: string): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const v = req.result as Rec | undefined;
      if (!v?.blob) {
        resolve(null);
        return;
      }
      resolve(new File([v.blob], v.name, { type: v.type || undefined }));
    };
    req.onerror = () => reject(req.error);
  });
}
