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
import { newAiVoiceInsert, type AiVoiceInsert } from "./ai-voice";
import {
  type SpectrumFilter,
  type SpectrumFilterKind,
  clampFilterGain,
  clampFilterHz,
  defaultFilterGain,
  defaultFilterQ,
  MAX_SPECTRUM_FILTERS,
  normalizeDelayTune,
  normalizeOffsetTune,
  normalizePitchTune,
  normalizeReverbTune,
} from "./spectrum-filters";
import {
  MAX_CABLE_INSERTS,
  asCableIndex,
  newCableInsert,
  type CableInsert,
} from "./cables";
import {
  MAX_DEVICE_IO,
  newDeviceIoInsert,
  type DeviceIoInsert,
} from "./device-io";
import {
  MAX_PIPELINES,
  type ExtraPipeline,
} from "./fx-pipeline";

export type FxSnapshot = {
  id: string;
  name: string;
  savedAt: string;
  master: MasterFx;
  filters: SpectrumFilter[];
  inserts: ObsInsert[];
  aiVoice?: AiVoiceInsert | null;
  liveChain?: LiveSlot[];
  cableInserts?: CableInsert[];
  deviceInserts?: DeviceIoInsert[];
  extraPipelines?: ExtraPipeline[];
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
  "band-reverb",
  "band-formant",
  "band-pitch",
  "band-delay",
  "band-offset",
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
    fullBand: raw.fullBand === true,
    reverb: normalizeReverbTune(raw.reverb),
    delay: normalizeDelayTune(raw.delay),
    offset: normalizeOffsetTune(raw.offset),
    pitch: normalizePitchTune(raw.pitch),
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

function normalizeFilterList(raw: unknown): SpectrumFilter[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<SpectrumFilter>[])
    .map((f) => normalizeFilter(f))
    .filter((f): f is SpectrumFilter => !!f)
    .slice(0, MAX_SPECTRUM_FILTERS);
}

function normalizeInsertList(raw: unknown, masterRaw?: Partial<MasterFx>): ObsInsert[] {
  if (Array.isArray(raw)) {
    return labelObsInserts(
      (raw as Partial<ObsInsert>[])
        .map((f) => normalizeObsInsert(f))
        .filter((f): f is ObsInsert => !!f)
        .slice(0, MAX_OBS_INSERTS),
    );
  }
  if (masterRaw) return labelObsInserts(insertsFromMaster(normalizeMasterFx(masterRaw)));
  return [];
}

function normalizeCableList(raw: unknown): CableInsert[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<CableInsert>[])
    .filter((c) => c && (c.kind === "out" || c.kind === "in"))
    .map((c) => newCableInsert(c.kind as CableInsert["kind"], c))
    .slice(0, MAX_CABLE_INSERTS);
}

function normalizeDeviceList(raw: unknown): DeviceIoInsert[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<DeviceIoInsert>[])
    .filter((d) => d && (d.kind === "mic-in" || d.kind === "speaker-out"))
    .map((d) => newDeviceIoInsert(d.kind as DeviceIoInsert["kind"], d))
    .slice(0, MAX_DEVICE_IO);
}

function normalizeSlots(raw: unknown): LiveSlot[] {
  if (!Array.isArray(raw)) return [];
  return (raw as LiveSlot[])
    .filter(
      (s) =>
        s &&
        (s.family === "spectrum" ||
          s.family === "obs" ||
          s.family === "ai" ||
          s.family === "cable" ||
          s.family === "device") &&
        typeof s.id === "string",
    )
    .map((s) => ({ family: s.family, id: s.id }));
}

function normalizeExtraPipeline(
  raw: Partial<ExtraPipeline>,
  fallbackNumber: number,
): ExtraPipeline | null {
  const number = Math.max(
    2,
    Math.min(MAX_PIPELINES, Math.round(num(raw.number, fallbackNumber))),
  );
  const filters = normalizeFilterList(raw.spectrumFilters);
  const inserts = normalizeInsertList(raw.obsInserts);
  const cables = normalizeCableList(raw.cableInserts);
  const devices = normalizeDeviceList(raw.deviceInserts);
  const aiVoice = raw.aiVoice
    ? newAiVoiceInsert(raw.aiVoice as Partial<AiVoiceInsert>)
    : null;
  const liveChain = reconcileLiveChain(
    normalizeSlots(raw.liveChain),
    filters,
    inserts,
    aiVoice,
    cables,
    devices,
  );
  return {
    id: str(raw.id, newFxId()),
    name: str(raw.name, `パイプライン${number}`).trim() || `パイプライン${number}`,
    enabled: raw.enabled !== false,
    number,
    inputCable: asCableIndex(raw.inputCable),
    outputCable: asCableIndex(raw.outputCable ?? raw.inputCable),
    spectrumFilters: filters,
    obsInserts: inserts,
    cableInserts: cables,
    deviceInserts: devices,
    aiVoice,
    liveChain,
  };
}

export function normalizeSnapshot(raw: Partial<FxSnapshot>): FxSnapshot {
  const masterRaw = (raw.master ?? {}) as Partial<MasterFx>;
  const filters = normalizeFilterList(raw.filters);
  const inserts = normalizeInsertList(raw.inserts, masterRaw);
  const cableInserts = normalizeCableList(raw.cableInserts);
  const deviceInserts = normalizeDeviceList(raw.deviceInserts);
  const parsedChain = normalizeSlots(raw.liveChain);
  const aiVoice = raw.aiVoice
    ? newAiVoiceInsert(raw.aiVoice as Partial<AiVoiceInsert>)
    : null;
  const extraPipelines = Array.isArray(raw.extraPipelines)
    ? raw.extraPipelines
        .map((p, i) => normalizeExtraPipeline(p ?? {}, i + 2))
        .filter((p): p is ExtraPipeline => !!p)
        .slice(0, MAX_PIPELINES - 1)
    : [];
  return {
    id: str(raw.id, newFxId()),
    name: str(raw.name, "無名").trim() || "無名",
    savedAt: str(raw.savedAt, new Date().toISOString()),
    master: normalizeMasterFx(masterRaw),
    filters,
    inserts,
    aiVoice,
    liveChain: reconcileLiveChain(
      parsedChain,
      filters,
      inserts,
      aiVoice,
      cableInserts,
      deviceInserts,
    ),
    cableInserts,
    deviceInserts,
    extraPipelines,
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

function filterXml(f: SpectrumFilter) {
  const rv = normalizeReverbTune(f.reverb);
  const d = normalizeDelayTune(f.delay);
  const o = normalizeOffsetTune(f.offset);
  const p = normalizePitchTune(f.pitch);
  return `      <filter id="${esc(f.id)}" name="${esc(f.name)}" kind="${f.kind}" hz="${f.hz}" q="${f.q}" gain="${f.gain ?? 0}" enabled="${f.enabled ? "true" : "false"}" fullBand="${f.fullBand ? "true" : "false"}" reverbDecay="${rv.decay}" reverbPredelay="${rv.predelayMs}" reverbBright="${rv.brightness}" reverbSize="${rv.size}" reverbLowCut="${rv.lowCutHz}" reverbHighCut="${rv.highCutHz}" reverbWidth="${rv.width}" delayTime="${d.timeMs}" delayFb="${d.feedback}" delayPing="${d.pingpong}" delayLowCut="${d.lowCutHz}" delayHighCut="${d.highCutHz}" delaySpread="${d.spreadMs}" delayMod="${d.mod}" delayModRate="${d.modRate}" delayDrive="${d.drive}" delaySync="${d.sync ? "true" : "false"}" delayNote="${d.note}" offsetTime="${o.timeMs}" pitchCents="${p.cents}" pitchFormant="${p.formant}" pitchPreserve="${p.preserve}" pitchMix="${p.mix}" pitchGrain="${p.grain}" pitchFb="${p.feedback}" pitchDelay="${p.delayMs}"/>`;
}

function insertXml(f: ObsInsert) {
  return `      <insert id="${esc(f.id)}" kind="${f.kind}" name="${esc(f.name)}" enabled="${f.enabled ? "true" : "false"}" amount="${f.amount}" eqLow="${f.eqLow}" eqMid="${f.eqMid}" eqHigh="${f.eqHigh}" phase="${f.phaseInvert ? "true" : "false"}" fullBand="${f.fullBand !== false ? "true" : "false"}" hz="${f.hz ?? 1000}" q="${f.q ?? 1.4}"/>`;
}

function cableXml(c: CableInsert) {
  return `      <cable id="${esc(c.id)}" name="${esc(c.name)}" enabled="${c.enabled ? "true" : "false"}" kind="${c.kind}" cable="${c.cable}" mode="${c.mode}" mix="${c.mix}"/>`;
}

function deviceXml(d: DeviceIoInsert) {
  return `      <device id="${esc(d.id)}" name="${esc(d.name)}" enabled="${d.enabled ? "true" : "false"}" kind="${d.kind}" deviceId="${esc(d.deviceId)}" deviceLabel="${esc(d.deviceLabel)}" mix="${d.mix}" mode="${d.mode}"/>`;
}

function chainXml(slots: LiveSlot[] | undefined) {
  const chain = (slots ?? [])
    .map((s) => `      <slot family="${s.family}" id="${esc(s.id)}"/>`)
    .join("\n");
  return chain || "      <!-- none -->";
}

function aiXml(v: AiVoiceInsert | null | undefined) {
  if (!v) return `    <ai/>`;
  return `    <ai id="${esc(v.id)}" name="${esc(v.name)}" enabled="${v.enabled ? "true" : "false"}" pitch="${v.pitch}" mix="${v.mix}" model="${esc(v.modelName)}" bytes="${v.modelBytes}"/>`;
}

function pipelineXml(p: ExtraPipeline) {
  const filters = p.spectrumFilters.map(filterXml).join("\n") || "      <!-- none -->";
  const inserts = p.obsInserts.map(insertXml).join("\n") || "      <!-- none -->";
  const cables = p.cableInserts.map(cableXml).join("\n") || "      <!-- none -->";
  const devices = p.deviceInserts.map(deviceXml).join("\n") || "      <!-- none -->";
  return `    <pipeline id="${esc(p.id)}" name="${esc(p.name)}" enabled="${p.enabled ? "true" : "false"}" number="${p.number}" inputCable="${p.inputCable}" outputCable="${p.outputCable}">
    <filters>
${filters}
    </filters>
    <inserts>
${inserts}
    </inserts>
    <cables>
${cables}
    </cables>
    <devices>
${devices}
    </devices>
${aiXml(p.aiVoice)}
    <chain>
${chainXml(p.liveChain)}
    </chain>
    </pipeline>`;
}

export function snapshotToXml(snap: FxSnapshot): string {
  const m = snap.master;
  const filters = snap.filters.map(filterXml).join("\n");
  const inserts = (snap.inserts ?? []).map(insertXml).join("\n");
  const cables = (snap.cableInserts ?? []).map(cableXml).join("\n");
  const devices = (snap.deviceInserts ?? []).map(deviceXml).join("\n");
  const pipelines = (snap.extraPipelines ?? []).map(pipelineXml).join("\n");
  return `  <preset id="${esc(snap.id)}" name="${esc(snap.name)}" savedAt="${esc(snap.savedAt)}">
    <master volume="${m.volume}" pitch="${m.pitchSemitones}" formant="${m.formantDb}" reverb="${m.reverbMix}" compressor="${m.compressor}" noise="${m.noise}" gate="${m.gate}" eqLow="${m.eqLow}" eqMid="${m.eqMid}" eqHigh="${m.eqHigh}" upward="${m.upward}" expander="${m.expander}" limiter="${m.limiter}" phase="${m.phaseInvert ? "true" : "false"}" mix="${m.preset}"/>
    <filters>
${filters || "      <!-- none -->"}
    </filters>
    <inserts>
${inserts || "      <!-- none -->"}
    </inserts>
    <cables>
${cables || "      <!-- none -->"}
    </cables>
    <devices>
${devices || "      <!-- none -->"}
    </devices>
${aiXml(snap.aiVoice)}
    <chain>
${chainXml(snap.liveChain)}
    </chain>
    <pipelines>
${pipelines || "      <!-- none -->"}
    </pipelines>
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

function parseFilterEl(f: Element): SpectrumFilter | null {
  return normalizeFilter({
    id: attr(f, "id"),
    name: attr(f, "name"),
    kind: attr(f, "kind") as SpectrumFilterKind,
    hz: num(attr(f, "hz"), 1000),
    q: num(attr(f, "q"), 0.7),
    gain: num(attr(f, "gain"), 0),
    enabled: attr(f, "enabled", "true") !== "false",
    fullBand: attr(f, "fullBand", "false") === "true",
    reverb: normalizeReverbTune({
      decay: num(attr(f, "reverbDecay"), 1.2),
      predelayMs: num(attr(f, "reverbPredelay"), 18),
      brightness: num(attr(f, "reverbBright"), 0.62),
      size: num(attr(f, "reverbSize"), 0.4),
      lowCutHz: num(attr(f, "reverbLowCut"), 120),
      highCutHz: num(attr(f, "reverbHighCut"), 8500),
      width: num(attr(f, "reverbWidth"), 0.72),
    }),
    delay: normalizeDelayTune({
      timeMs: num(attr(f, "delayTime"), 280),
      feedback: num(attr(f, "delayFb"), 0.32),
      pingpong: num(attr(f, "delayPing"), 0.35),
      lowCutHz: num(attr(f, "delayLowCut"), 90),
      highCutHz: num(attr(f, "delayHighCut"), 6500),
      spreadMs: num(attr(f, "delaySpread"), 12),
      mod: num(attr(f, "delayMod"), 0.08),
      modRate: num(attr(f, "delayModRate"), 0.65),
      drive: num(attr(f, "delayDrive"), 0),
      sync: attr(f, "delaySync") === "true",
      note: attr(f, "delayNote"),
    }),
    offset: normalizeOffsetTune({
      timeMs: num(attr(f, "offsetTime"), 80),
    }),
    pitch: normalizePitchTune({
      cents: num(attr(f, "pitchCents"), 0),
      formant: num(attr(f, "pitchFormant"), 0),
      preserve: num(attr(f, "pitchPreserve"), 0.55),
      mix: num(attr(f, "pitchMix"), 1),
      grain: num(attr(f, "pitchGrain"), 1024),
      feedback: num(attr(f, "pitchFb"), 0),
      delayMs: num(attr(f, "pitchDelay"), 28),
    }),
  });
}

function parseInsertEl(f: Element): ObsInsert | null {
  return normalizeObsInsert({
    id: attr(f, "id"),
    kind: attr(f, "kind") as ObsInsert["kind"],
    name: attr(f, "name"),
    enabled: attr(f, "enabled", "true") !== "false",
    amount: num(attr(f, "amount"), 0),
    eqLow: num(attr(f, "eqLow"), 0),
    eqMid: num(attr(f, "eqMid"), 0),
    eqHigh: num(attr(f, "eqHigh"), 0),
    phaseInvert: attr(f, "phase") === "true",
    fullBand: attr(f, "fullBand", "true") !== "false",
    hz: num(attr(f, "hz"), 1000),
    q: num(attr(f, "q"), 1.4),
  });
}

function parseCableEl(f: Element): CableInsert | null {
  const kind = attr(f, "kind");
  if (kind !== "out" && kind !== "in") return null;
  return newCableInsert(kind, {
    id: attr(f, "id"),
    name: attr(f, "name"),
    enabled: attr(f, "enabled", "true") !== "false",
    cable: asCableIndex(num(attr(f, "cable"), 1)),
    mode: attr(f, "mode") === "send" ? "send" : "split",
    mix: num(attr(f, "mix"), 1),
  });
}

function parseDeviceEl(f: Element): DeviceIoInsert | null {
  const kind = attr(f, "kind");
  if (kind !== "mic-in" && kind !== "speaker-out") return null;
  return newDeviceIoInsert(kind, {
    id: attr(f, "id"),
    name: attr(f, "name"),
    enabled: attr(f, "enabled", "true") !== "false",
    deviceId: attr(f, "deviceId"),
    deviceLabel: attr(f, "deviceLabel"),
    mix: num(attr(f, "mix"), 1),
    mode: attr(f, "mode") === "send" ? "send" : "split",
  });
}

function parseChainEl(el: Element | null): LiveSlot[] {
  if (!el) return [];
  return [...el.querySelectorAll(":scope > slot")]
    .map((s) => ({
      family: attr(s, "family"),
      id: attr(s, "id"),
    }))
    .filter(
      (s): s is LiveSlot =>
        (s.family === "spectrum" ||
          s.family === "obs" ||
          s.family === "ai" ||
          s.family === "cable" ||
          s.family === "device") &&
        !!s.id,
    );
}

function parseAiEl(el: Element | null): AiVoiceInsert | null {
  if (!el) return null;
  const id = attr(el, "id");
  if (!id) return null;
  return newAiVoiceInsert({
    id,
    name: attr(el, "name"),
    enabled: attr(el, "enabled", "true") !== "false",
    pitch: num(attr(el, "pitch"), 0),
    mix: num(attr(el, "mix"), 1),
    modelName: attr(el, "model"),
    modelBytes: num(attr(el, "bytes"), 0),
  });
}

function kids<T>(parent: Element | null, selector: string, map: (el: Element) => T | null): T[] {
  if (!parent) return [];
  return [...parent.querySelectorAll(selector)]
    .map(map)
    .filter((x): x is T => !!x);
}

function parsePipelineEl(el: Element, index: number): ExtraPipeline | null {
  return normalizeExtraPipeline(
    {
      id: attr(el, "id"),
      name: attr(el, "name"),
      enabled: attr(el, "enabled", "true") !== "false",
      number: num(attr(el, "number"), index + 2),
      inputCable: asCableIndex(num(attr(el, "inputCable"), 1)),
      outputCable: asCableIndex(num(attr(el, "outputCable"), 1)),
      spectrumFilters: kids(el.querySelector(":scope > filters"), ":scope > filter", parseFilterEl),
      obsInserts: kids(el.querySelector(":scope > inserts"), ":scope > insert", parseInsertEl),
      cableInserts: kids(el.querySelector(":scope > cables"), ":scope > cable", parseCableEl),
      deviceInserts: kids(el.querySelector(":scope > devices"), ":scope > device", parseDeviceEl),
      aiVoice: parseAiEl(el.querySelector(":scope > ai")),
      liveChain: parseChainEl(el.querySelector(":scope > chain")),
    },
    index + 2,
  );
}

function parsePresetEl(el: Element): FxSnapshot {
  const masterEl = el.querySelector(":scope > master");
  const mixRaw = (masterEl ? attr(masterEl, "mix") : "original") as MixPresetId;
  const room = parseProfileEl(el.querySelector(":scope > room"));
  const voice = parseProfileEl(el.querySelector(":scope > voice"));
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
    filters: kids(el.querySelector(":scope > filters"), ":scope > filter", parseFilterEl),
    inserts: kids(el.querySelector(":scope > inserts"), ":scope > insert", parseInsertEl),
    cableInserts: kids(el.querySelector(":scope > cables"), ":scope > cable", parseCableEl),
    deviceInserts: kids(el.querySelector(":scope > devices"), ":scope > device", parseDeviceEl),
    extraPipelines: [
      ...(el.querySelector(":scope > pipelines")?.querySelectorAll(":scope > pipeline") ??
        []),
    ]
      .map((p, i) => parsePipelineEl(p, i))
      .filter((p): p is ExtraPipeline => !!p),
    aiVoice: parseAiEl(el.querySelector(":scope > ai")),
    liveChain: parseChainEl(el.querySelector(":scope > chain")),
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
