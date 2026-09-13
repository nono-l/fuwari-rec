import type { MidiInstrumentId } from "@/lib/audio/midi-instruments";
import type { ParsedMidi } from "@/lib/audio/midi";
import { SOUNDFONT_CATALOG, soundfontInfo, type SoundfontInfo } from "./catalog";
import {
  idbDelete,
  idbGet,
  idbListIds,
  idbPut,
  readActiveId,
  writeActiveId,
} from "./idb";

export type SoundfontState = {
  activeId: string | null;
  label: string;
  ready: boolean;
  busy: boolean;
  progress: number;
  error: string;
  downloadedIds: string[];
};

const listeners = new Set<() => void>();

let state: SoundfontState = {
  activeId: null,
  label: "",
  ready: false,
  busy: false,
  progress: 0,
  error: "",
  downloadedIds: [],
};

let cached: { id: string; buffer: ArrayBuffer } | null = null;
let hydrated = false;

function emit(patch: Partial<SoundfontState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function getSoundfontState() {
  return state;
}

export function subscribeSoundfont(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isSf2(buf: ArrayBuffer) {
  if (buf.byteLength < 12) return false;
  const u = new Uint8Array(buf);
  const tag = String.fromCharCode(u[0]!, u[1]!, u[2]!, u[3]!);
  return tag === "RIFF";
}

async function downloadFirst(info: SoundfontInfo, onProg: (p: number) => void) {
  if (info.localOnly || info.urls.length === 0) {
    throw new Error(
      "この音源はサイズが大きいためアプリ経由では取れません。下から .sf2 を指定してください",
    );
  }
  // Prefer GitHub raw / small jsDelivr (CORS). Proxy last — large files 502 on host.
  const direct = info.urls.filter(
    (u) =>
      u.includes("raw.githubusercontent.com") ||
      (u.includes("cdn.jsdelivr.net") && info.bytes < 20 * 1024 * 1024),
  );
  const urls = [
    ...direct,
    `/api/soundfont/${encodeURIComponent(info.id)}`,
  ];
  let last: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = (await res.clone().json()) as { error?: string };
          if (j.error) detail = j.error;
        } catch {
          /* not json */
        }
        throw new Error(detail);
      }
      const total = Number(res.headers.get("content-length") || 0) || info.bytes;
      if (!res.body) {
        const buf = await res.arrayBuffer();
        onProg(1);
        if (!isSf2(buf)) throw new Error("SoundFont ではありません");
        return buf;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          onProg(Math.min(0.99, received / Math.max(1, total)));
        }
      }
      const out = new Uint8Array(received);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      if (!isSf2(out.buffer)) throw new Error("SoundFont ではありません");
      onProg(1);
      return out.buffer;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("ダウンロードに失敗しました");
}

export async function hydrateSoundfont() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  try {
    const ids = await idbListIds();
    const active = readActiveId();
    emit({ downloadedIds: ids });
    if (active && ids.includes(active)) {
      const row = await idbGet(active);
      if (row) {
        cached = { id: row.id, buffer: row.buffer };
        emit({
          activeId: row.id,
          label: row.label,
          ready: true,
          error: "",
        });
      }
    }
  } catch {
    /* private mode */
  }
}

export function isSoundfontReady() {
  return state.ready && Boolean(cached?.buffer);
}

export async function downloadSoundfont(id: string) {
  const info = soundfontInfo(id);
  if (!info) throw new Error("不明な SoundFont です");
  emit({ busy: true, progress: 0, error: "" });
  try {
    const existing = await idbGet(id);
    const buffer = existing?.buffer ?? (await downloadFirst(info, (p) => emit({ progress: p })));
    await idbPut({ id: info.id, label: info.label, buffer });
    cached = { id: info.id, buffer };
    writeActiveId(info.id);
    const ids = await idbListIds();
    emit({
      activeId: info.id,
      label: info.label,
      ready: true,
      busy: false,
      progress: 1,
      downloadedIds: ids,
      error: "",
    });
  } catch (e) {
    emit({
      busy: false,
      progress: 0,
      error: e instanceof Error ? e.message : "ダウンロードに失敗しました",
    });
    throw e;
  }
}

export async function loadSoundfontFile(file: File) {
  emit({ busy: true, progress: 0, error: "" });
  try {
    const buffer = await file.arrayBuffer();
    if (!isSf2(buffer)) throw new Error("SF2 ファイルではありません");
    const id = `file-${file.name.replace(/[^\w.-]+/g, "_").slice(0, 40)}`;
    const label = file.name.replace(/\.sf[23]$/i, "") || "ローカル";
    await idbPut({ id, label, buffer });
    cached = { id, buffer };
    writeActiveId(id);
    const ids = await idbListIds();
    emit({
      activeId: id,
      label,
      ready: true,
      busy: false,
      progress: 1,
      downloadedIds: ids,
      error: "",
    });
  } catch (e) {
    emit({
      busy: false,
      error: e instanceof Error ? e.message : "読み込みに失敗しました",
    });
    throw e;
  }
}

export async function activateSoundfont(id: string | null) {
  if (!id) {
    cached = null;
    writeActiveId(null);
    emit({ activeId: null, label: "", ready: false, error: "" });
    return;
  }
  emit({ busy: true, error: "" });
  const row = await idbGet(id);
  if (!row) {
    emit({ busy: false, error: "端末にその SoundFont がありません" });
    return;
  }
  cached = { id: row.id, buffer: row.buffer };
  writeActiveId(row.id);
  emit({
    activeId: row.id,
    label: row.label,
    ready: true,
    busy: false,
    error: "",
  });
}

export async function removeSoundfont(id: string) {
  await idbDelete(id);
  const ids = await idbListIds();
  if (state.activeId === id) {
    cached = null;
    writeActiveId(null);
    emit({
      activeId: null,
      label: "",
      ready: false,
      downloadedIds: ids,
    });
    return;
  }
  emit({ downloadedIds: ids });
}

export async function renderMidiWithSoundfont(
  parsed: ParsedMidi,
  sampleRate: number,
  instrument: MidiInstrumentId,
): Promise<AudioBuffer> {
  await hydrateSoundfont();
  const buf = cached?.buffer;
  if (!buf) throw new Error("SoundFont がありません");
  const { renderWithFluidSynth } = await import("./fluidsynth");
  return renderWithFluidSynth(buf, parsed, sampleRate, instrument);
}

export { SOUNDFONT_CATALOG };
