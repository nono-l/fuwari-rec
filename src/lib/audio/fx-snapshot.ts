import type { MasterFx, MixPresetId } from "./types";
import {
  insertsFromMaster,
  labelObsInserts,
  MAX_OBS_INSERTS,
  normalizeMasterFx,
  normalizeObsInsert,
  type ObsInsert,
} from "./obs-filters";
import type { RoomProfile } from "./room-profile";
import { ROOM_FFT } from "./room-profile";
import { type LiveSlot, reconcileLiveChain } from "./live-fx";
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
  inserts: ObsInsert[];
  liveChain?: LiveSlot[];
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
  const filters = (raw.filters ?? [])
    .map((f) => normalizeFilter(f))
    .filter((f): f is SpectrumFilter => !!f)
    .slice(0, 8);
  const inserts = labelObsInserts(
    Array.isArray(raw.inserts)
      ? (raw.inserts as Partial<ObsInsert>[])
          .map((f) => normalizeObsInsert(f))
          .filter((f): f is ObsInsert => !!f)
          .slice(0, MAX_OBS_INSERTS)
      : insertsFromMaster(normalizeMasterFx(masterRaw)),
  );
  const parsedChain = Array.isArray(raw.liveChain)
    ? (raw.liveChain as LiveSlot[])
        .filter(
          (s) =>
            s &&
            (s.family === "spectrum" || s.family === "obs") &&
            typeof s.id === "string",
        )
        .map((s) => ({ family: s.family, id: s.id }))
    : [];
  return {
    id: str(raw.id, newFxId()),
    name: str(raw.name, "無名").trim() || "無名",
    savedAt: str(raw.savedAt, new Date().toISOString()),
    master: normalizeMasterFx(masterRaw),
    filters,
    inserts,
    liveChain: reconcileLiveChain(parsedChain, filters, inserts),
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
  const inserts = (snap.inserts ?? [])
    .map(
      (f) =>
        `      <insert id="${esc(f.id)}" kind="${f.kind}" name="${esc(f.name)}" enabled="${f.enabled ? "true" : "false"}" amount="${f.amount}" eqLow="${f.eqLow}" eqMid="${f.eqMid}" eqHigh="${f.eqHigh}" phase="${f.phaseInvert ? "true" : "false"}"/>`,
    )
    .join("\n");
  const chain = (snap.liveChain ?? [])
    .map((s) => `      <slot family="${s.family}" id="${esc(s.id)}"/>`)
    .join("\n");
  return `  <preset id="${esc(snap.id)}" name="${esc(snap.name)}" savedAt="${esc(snap.savedAt)}">
    <master volume="${m.volume}" pitch="${m.pitchSemitones}" formant="${m.formantDb}" reverb="${m.reverbMix}" compressor="${m.compressor}" noise="${m.noise}" gate="${m.gate}" eqLow="${m.eqLow}" eqMid="${m.eqMid}" eqHigh="${m.eqHigh}" upward="${m.upward}" expander="${m.expander}" limiter="${m.limiter}" phase="${m.phaseInvert ? "true" : "false"}" mix="${m.preset}"/>
    <filters>
${filters || "      <!-- none -->"}
    </filters>
    <inserts>
${inserts || "      <!-- none -->"}
    </inserts>
    <chain>
${chain || "      <!-- none -->"}
    </chain>
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
  const insertParent = el.querySelector("inserts");
  const inserts = insertParent
    ? [...insertParent.querySelectorAll(":scope > insert")].map((f) =>
        normalizeObsInsert({
          id: attr(f, "id"),
          kind: attr(f, "kind") as ObsInsert["kind"],
          name: attr(f, "name"),
          enabled: attr(f, "enabled", "true") !== "false",
          amount: num(attr(f, "amount"), 0),
          eqLow: num(attr(f, "eqLow"), 0),
          eqMid: num(attr(f, "eqMid"), 0),
          eqHigh: num(attr(f, "eqHigh"), 0),
          phaseInvert: attr(f, "phase") === "true",
        }),
      )
    : undefined;
  const chainParent = el.querySelector("chain");
  const liveChain = chainParent
    ? [...chainParent.querySelectorAll(":scope > slot")]
        .map((s) => ({
          family: attr(s, "family"),
          id: attr(s, "id"),
        }))
        .filter(
          (s): s is LiveSlot =>
            (s.family === "spectrum" || s.family === "obs") && !!s.id,
        )
    : undefined;
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
      gate: num(masterEl ? attr(masterEl, "gate") : 0, 0),
      eqLow: num(masterEl ? attr(masterEl, "eqLow") : 0, 0),
      eqMid: num(masterEl ? attr(masterEl, "eqMid") : 0, 0),
      eqHigh: num(masterEl ? attr(masterEl, "eqHigh") : 0, 0),
      upward: num(masterEl ? attr(masterEl, "upward") : 0, 0),
      expander: num(masterEl ? attr(masterEl, "expander") : 0, 0),
      limiter: num(masterEl ? attr(masterEl, "limiter") : 0.25, 0.25),
      phaseInvert: (masterEl ? attr(masterEl, "phase") : "false") === "true",
      preset: MIX_IDS.has(mixRaw) ? mixRaw : "original",
    },
    filters: filters.filter((f): f is SpectrumFilter => !!f),
    inserts: inserts
      ?.filter((f): f is ObsInsert => !!f),
    liveChain,
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
