import type { MasterFx, MixPresetId } from "./types";
import type { RoomProfile } from "./room-profile";
import { ROOM_FFT } from "./room-profile";
import {
  type SpectrumFilter,
  type SpectrumFilterKind,
  clampFilterGain,
  clampFilterHz,
  defaultFilterGain,
  defaultFilterQ,
} from "./spectrum-filters";

export type FxSnapshot = {
  id: string;
  name: string;
  savedAt: string;
  master: MasterFx;
  filters: SpectrumFilter[];
  roomAmount: number;
  voiceAmount: number;
  roomProfile: RoomProfile | null;
  voiceProfile: RoomProfile | null;
};

export type FxLibraryState = {
  version: 1;
  presets: FxSnapshot[];
};

const STORAGE_KEY = "fuwari.fx-library.v1";

const KINDS = new Set<SpectrumFilterKind>([
  "cut-above",
  "cut-below",
  "notch",
  "keep-band",
  "peak",
]);

const MIX_IDS = new Set<MixPresetId>([
  "original",
  "studio",
  "radio",
  "hall",
  "whisper",
  "bright",
]);

export function newFxId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadFxLibrary(): FxSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FxLibraryState | FxSnapshot[];
    const list = Array.isArray(parsed) ? parsed : parsed.presets;
    return (list ?? []).map(normalizeSnapshot).filter((p) => p.name);
  } catch {
    return [];
  }
}

export function saveFxLibrary(presets: FxSnapshot[]) {
  if (typeof window === "undefined") return;
  const payload: FxLibraryState = { version: 1, presets };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function upsertFxPreset(
  snap: FxSnapshot,
  library: FxSnapshot[],
): FxSnapshot[] {
  const name = snap.name.trim();
  const idx = library.findIndex((p) => p.name === name);
  if (idx >= 0) {
    const next = library.slice();
    next[idx] = { ...snap, id: library[idx]!.id, name };
    return next;
  }
  return [{ ...snap, name }, ...library];
}

export function removeFxPreset(id: string, library: FxSnapshot[]) {
  return library.filter((p) => p.id !== id);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function num(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function normalizeFilter(raw: Partial<SpectrumFilter>): SpectrumFilter | null {
  const kind = raw.kind as SpectrumFilterKind;
  if (!KINDS.has(kind)) return null;
  return {
    id: str(raw.id, newFxId()),
    name: str(raw.name, kind),
    kind,
    hz: clampFilterHz(num(raw.hz, 1000)),
    q: Math.max(0.3, Math.min(18, num(raw.q, defaultFilterQ(kind)))),
    gain: clampFilterGain(num(raw.gain, defaultFilterGain(kind))),
    enabled: raw.enabled !== false,
  };
}

function normalizeProfile(raw: unknown): RoomProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<RoomProfile>;
  const bins = Array.isArray(p.bins)
    ? p.bins.map((x) => num(x, 0)).filter((n) => Number.isFinite(n))
    : [];
  if (!bins.length) return null;
  return {
    bins,
    fftSize: num(p.fftSize, ROOM_FFT) || ROOM_FFT,
    frames: num(p.frames, 1),
    capturedAt: num(p.capturedAt, Date.now()),
  };
}

export function normalizeSnapshot(raw: Partial<FxSnapshot>): FxSnapshot {
  const masterRaw = (raw.master ?? {}) as Partial<MasterFx>;
  const mix = MIX_IDS.has(masterRaw.preset as MixPresetId)
    ? (masterRaw.preset as MixPresetId)
    : "original";
  return {
    id: str(raw.id, newFxId()),
    name: str(raw.name, "無名").trim() || "無名",
    savedAt: str(raw.savedAt, new Date().toISOString()),
    master: {
      volume: clamp01(num(masterRaw.volume, 1)),
      pitchSemitones: Math.max(
        -12,
        Math.min(12, num(masterRaw.pitchSemitones, 0)),
      ),
      formantDb: Math.max(-12, Math.min(12, num(masterRaw.formantDb, 0))),
      reverbMix: clamp01(num(masterRaw.reverbMix, 0.15)),
      compressor: clamp01(num(masterRaw.compressor, 0.3)),
      noise: clamp01(num(masterRaw.noise, 0)),
      preset: mix,
    },
    filters: (raw.filters ?? [])
      .map((f) => normalizeFilter(f))
      .filter((f): f is SpectrumFilter => !!f)
      .slice(0, 8),
    roomAmount: clamp01(num(raw.roomAmount, 0)),
    voiceAmount: clamp01(num(raw.voiceAmount, 0)),
    roomProfile: normalizeProfile(raw.roomProfile),
    voiceProfile: normalizeProfile(raw.voiceProfile),
  };
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function binsXml(bins: number[]) {
  return bins.map((n) => (Math.round(n * 1e6) / 1e6).toString()).join(" ");
}

function profileXml(tag: string, amount: number, profile: RoomProfile | null) {
  if (!profile?.bins.length) {
    return `    <${tag} amount="${amount.toFixed(4)}"/>`;
  }
  return `    <${tag} amount="${amount.toFixed(4)}" fftSize="${profile.fftSize}" frames="${profile.frames}" capturedAt="${profile.capturedAt}">
      <bins>${binsXml(profile.bins)}</bins>
    </${tag}>`;
}

export function snapshotToXml(snap: FxSnapshot): string {
  const m = snap.master;
  const filters = snap.filters
    .map(
      (f) =>
        `      <filter id="${esc(f.id)}" name="${esc(f.name)}" kind="${f.kind}" hz="${f.hz}" q="${f.q}" gain="${f.gain ?? 0}" enabled="${f.enabled ? "true" : "false"}"/>`,
    )
    .join("\n");
  return `  <preset id="${esc(snap.id)}" name="${esc(snap.name)}" savedAt="${esc(snap.savedAt)}">
    <master volume="${m.volume}" pitch="${m.pitchSemitones}" formant="${m.formantDb}" reverb="${m.reverbMix}" compressor="${m.compressor}" noise="${m.noise}" mix="${m.preset}"/>
    <filters>
${filters || "      <!-- none -->"}
    </filters>
${profileXml("room", snap.roomAmount, snap.roomProfile)}
${profileXml("voice", snap.voiceAmount, snap.voiceProfile)}
  </preset>`;
}

export function fxBankToXml(presets: FxSnapshot[]): string {
  const body = presets.map(snapshotToXml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<fuwari-fx version="1" app="Fuwari REC">
${body || "  <!-- empty -->"}
</fuwari-fx>
`;
}

export function fxSnapshotToXml(snap: FxSnapshot): string {
  return fxBankToXml([snap]);
}

function attr(el: Element, name: string, fallback = "") {
  return el.getAttribute(name) ?? fallback;
}

function parseBins(text: string): number[] {
  return text
    .trim()
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

function parseProfileEl(el: Element | null): {
  amount: number;
  profile: RoomProfile | null;
} {
  if (!el) return { amount: 0, profile: null };
  const amount = clamp01(num(attr(el, "amount"), 0));
  const binsEl = el.querySelector("bins");
  const bins = binsEl ? parseBins(binsEl.textContent ?? "") : [];
  if (!bins.length) return { amount, profile: null };
  return {
    amount,
    profile: {
      bins,
      fftSize: num(attr(el, "fftSize"), ROOM_FFT) || ROOM_FFT,
      frames: num(attr(el, "frames"), 1),
      capturedAt: num(attr(el, "capturedAt"), Date.now()),
    },
  };
}

function parsePresetEl(el: Element): FxSnapshot {
  const masterEl = el.querySelector("master");
  const mixRaw = (masterEl ? attr(masterEl, "mix") : "original") as MixPresetId;
  const room = parseProfileEl(el.querySelector("room"));
  const voice = parseProfileEl(el.querySelector("voice"));
  const filters = [...el.querySelectorAll("filters > filter")].map((f) =>
    normalizeFilter({
      id: attr(f, "id"),
      name: attr(f, "name"),
      kind: attr(f, "kind") as SpectrumFilterKind,
      hz: num(attr(f, "hz"), 1000),
      q: num(attr(f, "q"), 0.7),
      gain: num(attr(f, "gain"), 0),
      enabled: attr(f, "enabled", "true") !== "false",
    }),
  );
  return normalizeSnapshot({
    id: attr(el, "id") || newFxId(),
    name: attr(el, "name") || "無名",
    savedAt: attr(el, "savedAt") || new Date().toISOString(),
    master: {
      volume: num(masterEl ? attr(masterEl, "volume") : 1, 1),
      pitchSemitones: num(masterEl ? attr(masterEl, "pitch") : 0, 0),
      formantDb: num(masterEl ? attr(masterEl, "formant") : 0, 0),
      reverbMix: num(masterEl ? attr(masterEl, "reverb") : 0.15, 0.15),
      compressor: num(masterEl ? attr(masterEl, "compressor") : 0.3, 0.3),
      noise: num(masterEl ? attr(masterEl, "noise") : 0, 0),
      preset: MIX_IDS.has(mixRaw) ? mixRaw : "original",
    },
    filters: filters.filter((f): f is SpectrumFilter => !!f),
    roomAmount: room.amount,
    voiceAmount: voice.amount,
    roomProfile: room.profile,
    voiceProfile: voice.profile,
  });
}

export function parseFxXml(xml: string): FxSnapshot[] {
  const text = xml.trim();
  if (!text) throw new Error("XML が空です");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    throw new Error("XML を読めませんでした。形式を確認してください");
  }
  const root = doc.documentElement;
  if (!root) throw new Error("XML にルートがありません");
  const tag = root.tagName.toLowerCase();
  if (tag === "preset") return [parsePresetEl(root)];
  const presets = [...root.querySelectorAll(":scope > preset, preset")];
  // de-dupe if querySelectorAll matched nested
  const seen = new Set<Element>();
  const unique = presets.filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    return el.parentElement === root || tag === "preset";
  });
  const list = (unique.length ? unique : presets).map(parsePresetEl);
  if (!list.length) {
    throw new Error("プリセットが見つかりません（<preset> が必要です）");
  }
  return list.map((p) => ({ ...p, id: newFxId() }));
}

export function downloadXml(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .slice(0, 40) || "fx"
  );
}
