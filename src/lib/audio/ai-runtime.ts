import { formatModelSize } from "./ai-voice";

export type AiRuntimeSlotId = "hubert" | "rmvpe" | "pretrained";

export type AiRuntimeMeta = {
  id: AiRuntimeSlotId;
  name: string;
  bytes: number;
  savedAt: number;
};

export type AiRuntimeSlotDef = {
  id: AiRuntimeSlotId;
  label: string;
  role: string;
  accept: string;
  optional: boolean;
  officialUrl: string;
  officialName: string;
};

export const AI_RUNTIME_SLOTS: AiRuntimeSlotDef[] = [
  {
    id: "hubert",
    label: "内容エンコーダ",
    role: "何を言ったかを取る土台。HuBERT / ContentVec。誰の声色でもない",
    accept: ".pt,.pth,.onnx",
    optional: true,
    officialUrl:
      "https://huggingface.co/lj1995/VoiceConversionWebUI/blob/main/hubert_base.pt",
    officialName: "hubert_base.pt（公式・約190MB）",
  },
  {
    id: "rmvpe",
    label: "ピッチ抽出",
    role: "音の高さを精密に取る。未設定でもキー（半音）は動く",
    accept: ".pt,.pth,.onnx",
    optional: true,
    officialUrl:
      "https://huggingface.co/lj1995/VoiceConversionWebUI/blob/main/rmvpe.pt",
    officialName: "rmvpe.pt または rmvpe.onnx",
  },
  {
    id: "pretrained",
    label: "学習の初期重み",
    role: "自分で声を学習するときだけ。変換そのものには不要",
    accept: ".pth,.pt",
    optional: true,
    officialUrl:
      "https://huggingface.co/lj1995/VoiceConversionWebUI/tree/main/pretrained_v2",
    officialName: "pretrained_v2（f0G48k.pth など）",
  },
];

const DB_NAME = "fuwari-ai-runtime-v1";
const STORE = "files";

type StoredFile = {
  name: string;
  bytes: number;
  type: string;
  blob: Blob;
  savedAt: number;
};

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

export async function listAiRuntimeMeta(): Promise<
  Record<AiRuntimeSlotId, AiRuntimeMeta | null>
> {
  const empty: Record<AiRuntimeSlotId, AiRuntimeMeta | null> = {
    hubert: null,
    rmvpe: null,
    pretrained: null,
  };
  const db = await openDb();
  if (!db) return empty;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const id = cursor.key as AiRuntimeSlotId;
      const v = cursor.value as StoredFile;
      if (id === "hubert" || id === "rmvpe" || id === "pretrained") {
        empty[id] = {
          id,
          name: v.name,
          bytes: v.bytes,
          savedAt: v.savedAt,
        };
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(empty);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAiRuntimeFile(id: AiRuntimeSlotId, file: File) {
  const db = await openDb();
  if (!db) throw new Error("この端末では保存できません");
  const rec: StoredFile = {
    name: file.name,
    bytes: file.size,
    type: file.type,
    blob: file,
    savedAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return {
    id,
    name: rec.name,
    bytes: rec.bytes,
    savedAt: rec.savedAt,
  } satisfies AiRuntimeMeta;
}

export async function loadAiRuntimeFile(
  id: AiRuntimeSlotId,
): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const v = req.result as StoredFile | undefined;
      if (!v?.blob) {
        resolve(null);
        return;
      }
      resolve(new File([v.blob], v.name, { type: v.type || undefined }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAiRuntimeFile(id: AiRuntimeSlotId) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type AiRuntimeMode = "passthrough" | "partial" | "ready";

export function aiRuntimeMode(
  slots: Record<AiRuntimeSlotId, AiRuntimeMeta | null>,
): AiRuntimeMode {
  if (slots.hubert && slots.rmvpe) return "ready";
  if (slots.hubert || slots.rmvpe) return "partial";
  return "passthrough";
}

export function aiRuntimeModeLabel(mode: AiRuntimeMode) {
  if (mode === "ready") return "土台あり（声モデルをエフェクターで選択）";
  if (mode === "partial") return "土台の一部あり。未設定でもキーは使えます";
  return "未設定。AIボイスは素通り＋キーで動きます";
}

export function slotSizeLabel(meta: AiRuntimeMeta | null) {
  if (!meta) return "未設定";
  const size = formatModelSize(meta.bytes);
  return size ? `${meta.name} · ${size}` : meta.name;
}
