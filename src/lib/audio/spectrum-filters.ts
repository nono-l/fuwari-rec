export type SpectrumFilterKind =
  | "cut-above"
  | "cut-below"
  | "notch"
  | "keep-band"
  | "peak"
  | "band-reverb"
  | "band-formant"
  | "band-pitch"
  | "band-delay"
  | "band-offset";

export type ReverbTune = {
  /** Tail length, seconds. */
  decay: number;
  /** Gap before the tail, milliseconds. */
  predelayMs: number;
  /** 0 = dark / damped, 1 = bright. */
  brightness: number;
  /** 0 = small room, 1 = hall. */
  size: number;
  /** High-pass on the send, Hz. */
  lowCutHz: number;
  /** Low-pass ceiling on the send, Hz. */
  highCutHz: number;
  /** 0 = mono tail, 1 = wide stereo. */
  width: number;
};

export const DEFAULT_REVERB_TUNE: ReverbTune = {
  decay: 1.2,
  predelayMs: 18,
  brightness: 0.62,
  size: 0.4,
  lowCutHz: 120,
  highCutHz: 8500,
  width: 0.72,
};

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function normalizeReverbTune(
  raw?: Partial<ReverbTune> | null,
): ReverbTune {
  const r = raw ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    decay: Math.max(0.4, Math.min(4, num(r.decay, DEFAULT_REVERB_TUNE.decay))),
    predelayMs: Math.max(
      0,
      Math.min(80, num(r.predelayMs, DEFAULT_REVERB_TUNE.predelayMs)),
    ),
    brightness: clamp01(num(r.brightness, DEFAULT_REVERB_TUNE.brightness)),
    size: clamp01(num(r.size, DEFAULT_REVERB_TUNE.size)),
    lowCutHz: Math.max(
      40,
      Math.min(400, num(r.lowCutHz, DEFAULT_REVERB_TUNE.lowCutHz)),
    ),
    highCutHz: Math.max(
      1500,
      Math.min(16000, num(r.highCutHz, DEFAULT_REVERB_TUNE.highCutHz)),
    ),
    width: clamp01(num(r.width, DEFAULT_REVERB_TUNE.width)),
  };
}

export type DelayNoteId =
  | "1/4"
  | "1/4d"
  | "1/8"
  | "1/8d"
  | "1/8t"
  | "1/16";

export const DELAY_NOTES: {
  id: DelayNoteId;
  label: string;
  beats: number;
}[] = [
  { id: "1/4", label: "4分", beats: 1 },
  { id: "1/4d", label: "4分付点", beats: 1.5 },
  { id: "1/8", label: "8分", beats: 0.5 },
  { id: "1/8d", label: "8分付点", beats: 0.75 },
  { id: "1/8t", label: "8分3連", beats: 1 / 3 },
  { id: "1/16", label: "16分", beats: 0.25 },
];

export type DelayTune = {
  /** Delay time, milliseconds (used when sync is off). */
  timeMs: number;
  /** Repeat amount 0–1. */
  feedback: number;
  /** 0 = independent L/R, 1 = L→R bounce. */
  pingpong: number;
  /** High-pass in the feedback loop, Hz. */
  lowCutHz: number;
  /** Low-pass in the feedback loop, Hz. */
  highCutHz: number;
  /** Extra delay on the right, milliseconds. */
  spreadMs: number;
  /** Tape-style time wobble, 0–1. */
  mod: number;
  /** LFO rate in Hz. */
  modRate: number;
  /** Saturation in the repeats, 0–1. */
  drive: number;
  /** Lock time to session BPM. */
  sync: boolean;
  note: DelayNoteId;
};

export const DEFAULT_DELAY_TUNE: DelayTune = {
  timeMs: 280,
  feedback: 0.32,
  pingpong: 0.35,
  lowCutHz: 90,
  highCutHz: 6500,
  spreadMs: 12,
  mod: 0.08,
  modRate: 0.65,
  drive: 0,
  sync: false,
  note: "1/8",
};

export function delayTimeFromBpm(
  bpm: number,
  note: DelayNoteId,
  fallbackMs: number,
) {
  const beats = DELAY_NOTES.find((n) => n.id === note)?.beats ?? 0.5;
  const q = bpm > 20 && bpm < 400 ? bpm : 0;
  if (!q) return fallbackMs;
  return Math.max(20, Math.min(1800, (60000 / q) * beats));
}

export function normalizeDelayTune(
  raw?: (Partial<Omit<DelayTune, "note">> & { note?: string }) | null,
): DelayTune {
  const r = raw ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const noteRaw = String(r.note ?? DEFAULT_DELAY_TUNE.note);
  const note = (DELAY_NOTES.some((n) => n.id === noteRaw)
    ? noteRaw
    : DEFAULT_DELAY_TUNE.note) as DelayNoteId;
  return {
    timeMs: Math.max(20, Math.min(1800, num(r.timeMs, DEFAULT_DELAY_TUNE.timeMs))),
    feedback: clamp01(num(r.feedback, DEFAULT_DELAY_TUNE.feedback)),
    pingpong: clamp01(num(r.pingpong, DEFAULT_DELAY_TUNE.pingpong)),
    lowCutHz: Math.max(
      40,
      Math.min(400, num(r.lowCutHz, DEFAULT_DELAY_TUNE.lowCutHz)),
    ),
    highCutHz: Math.max(
      800,
      Math.min(16000, num(r.highCutHz, DEFAULT_DELAY_TUNE.highCutHz)),
    ),
    spreadMs: Math.max(0, Math.min(80, num(r.spreadMs, DEFAULT_DELAY_TUNE.spreadMs))),
    mod: clamp01(num(r.mod, DEFAULT_DELAY_TUNE.mod)),
    modRate: Math.max(0.1, Math.min(8, num(r.modRate, DEFAULT_DELAY_TUNE.modRate))),
    drive: clamp01(num(r.drive, DEFAULT_DELAY_TUNE.drive)),
    sync: r.sync === true,
    note,
  };
}

export type OffsetTune = {
  /** Constant output lag, milliseconds. No repeats. */
  timeMs: number;
};

export const DEFAULT_OFFSET_TUNE: OffsetTune = {
  timeMs: 80,
};

export function normalizeOffsetTune(
  raw?: Partial<OffsetTune> | null,
): OffsetTune {
  const r = raw ?? {};
  const n = typeof r.timeMs === "number" ? r.timeMs : Number(r.timeMs);
  return {
    timeMs: Math.max(
      5,
      Math.min(1500, Number.isFinite(n) ? n : DEFAULT_OFFSET_TUNE.timeMs),
    ),
  };
}

export type SpectrumFilter = {
  id: string;
  name: string;
  kind: SpectrumFilterKind;
  hz: number;
  q: number;
  /** Peaking EQ gain in dB. Unused (0) for other kinds. */
  gain: number;
  enabled: boolean;
  /** When true, skip band split and process the whole spectrum. */
  fullBand: boolean;
  reverb: ReverbTune;
  delay: DelayTune;
  offset: OffsetTune;
};

export const SPEC_MIN_HZ = 40;
export const SPEC_MAX_HZ = 16000;
export const MAX_SPECTRUM_FILTERS = 48;

export const FILTER_KINDS: {
  id: SpectrumFilterKind;
  label: string;
  hint: string;
}[] = [
  { id: "cut-above", label: "ここより上を消す", hint: "ローパス" },
  { id: "cut-below", label: "ここより下を消す", hint: "ハイパス" },
  { id: "notch", label: "この付近を消す", hint: "ノッチ" },
  { id: "keep-band", label: "この帯だけ残す", hint: "バンドパス" },
  { id: "peak", label: "この帯を上げ下げ", hint: "バンドパスゲイン ±" },
  { id: "band-reverb", label: "この帯に残響", hint: "帯域センドリバーブ" },
  { id: "band-formant", label: "この帯をフォルマント風", hint: "F1/F2 ピーク" },
  { id: "band-pitch", label: "この帯をピッチシフト", hint: "簡易グレイン" },
  { id: "band-delay", label: "この帯にディレイ", hint: "帯域エコー" },
  { id: "band-offset", label: "この帯をずらす", hint: "繰り返しなしの時間ずらし" },
];

export function formatHz(hz: number) {
  if (hz >= 1000) return `${Math.round(hz / 100) / 10}kHz`;
  return `${Math.round(hz)}Hz`;
}

export function filterKindLabel(kind: SpectrumFilterKind) {
  return FILTER_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function defaultFilterQ(kind: SpectrumFilterKind) {
  if (kind === "notch") return 6;
  if (
    kind === "keep-band" ||
    kind === "peak" ||
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay" ||
    kind === "band-offset"
  ) {
    return 1.4;
  }
  return 0.7;
}

export function defaultFilterGain(kind: SpectrumFilterKind) {
  if (kind === "peak" || kind === "band-formant") return 6;
  if (kind === "band-reverb") return 8;
  if (kind === "band-delay") return 7;
  if (kind === "band-offset") return 18;
  if (kind === "band-pitch") return 2;
  return 0;
}

export function clampFilterGain(gain: number) {
  return Math.max(-18, Math.min(18, gain));
}

export function formatGainDb(gain: number) {
  const g = clampFilterGain(gain);
  const body = Math.abs(g).toFixed(1);
  if (g > 0.05) return `+${body} dB`;
  if (g < -0.05) return `−${body} dB`;
  return "0.0 dB";
}

export function usesGain(kind: SpectrumFilterKind) {
  return (
    kind === "peak" ||
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay" ||
    kind === "band-offset"
  );
}

export function formatFilterAmount(kind: SpectrumFilterKind, gain: number) {
  if (kind === "band-reverb") {
    const pct = Math.round((Math.max(0, Math.min(18, gain)) / 18) * 100);
    return `${pct}%`;
  }
  if (kind === "band-delay") {
    const pct = Math.round((Math.max(0, Math.min(18, gain)) / 18) * 100);
    return `${pct}%`;
  }
  if (kind === "band-offset") {
    const pct = Math.round((Math.max(0, Math.min(18, gain)) / 18) * 100);
    return `${pct}%`;
  }
  if (kind === "band-pitch") {
    const s = Math.round(gain * 10) / 10;
    if (s > 0.05) return `+${s.toFixed(1)} 半音`;
    if (s < -0.05) return `${s.toFixed(1)} 半音`;
    return "0 半音";
  }
  return formatGainDb(gain);
}

export function amountSliderLabel(kind: SpectrumFilterKind) {
  if (kind === "band-reverb") return "残響の量";
  if (kind === "band-delay") return "ディレイの量";
  if (kind === "band-offset") return "ずらした音の割合";
  if (kind === "band-formant") return "フォルマントの量";
  if (kind === "band-pitch") return "シフト（半音）";
  return "バンドパスゲイン";
}

export function defaultFilterName(
  kind: SpectrumFilterKind,
  hz: number,
  fullBand = false,
) {
  const short =
    kind === "cut-above"
      ? "高域カット"
      : kind === "cut-below"
        ? "低域カット"
        : kind === "notch"
          ? "ノッチ"
          : kind === "peak"
            ? fullBand
              ? "ゲイン"
              : "帯ゲイン"
            : kind === "band-reverb"
              ? fullBand
                ? "残響"
                : "帯残響"
              : kind === "band-formant"
                ? fullBand
                  ? "フォルマント"
                  : "帯フォルマント"
                : kind === "band-pitch"
                  ? fullBand
                    ? "ピッチ"
                    : "帯ピッチ"
                  : kind === "band-delay"
                    ? fullBand
                      ? "ディレイ"
                      : "帯ディレイ"
                    : kind === "band-offset"
                      ? fullBand
                        ? "オフセット"
                        : "帯オフセット"
                      : "帯域通過";
  if (fullBand && allowsBandToggle(kind)) return short;
  return `${short} ${formatHz(hz)}`;
}

export function clampFilterHz(hz: number) {
  return Math.max(SPEC_MIN_HZ, Math.min(SPEC_MAX_HZ, hz));
}

export function bandWidthHz(hz: number, q: number) {
  return clampFilterHz(hz) / Math.max(0.3, q);
}

export function qFromBandWidthHz(hz: number, widthHz: number) {
  return Math.max(
    0.3,
    Math.min(18, clampFilterHz(hz) / Math.max(12, widthHz)),
  );
}

export function bandEdges(hz: number, q: number) {
  const f = clampFilterHz(hz);
  const bw = bandWidthHz(f, q);
  return {
    lo: Math.max(SPEC_MIN_HZ, f - bw / 2),
    hi: Math.min(SPEC_MAX_HZ, f + bw / 2),
    bw,
  };
}

export function allowsBandToggle(kind: SpectrumFilterKind) {
  return (
    kind === "peak" ||
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay" ||
    kind === "band-offset"
  );
}

export function usesBandWidth(kind: SpectrumFilterKind, fullBand = false) {
  if (fullBand && allowsBandToggle(kind)) return false;
  return (
    kind === "notch" ||
    kind === "keep-band" ||
    kind === "peak" ||
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay" ||
    kind === "band-offset"
  );
}

export function newSpectrumFilter(
  kind: SpectrumFilterKind,
  hz: number,
): SpectrumFilter {
  const f = clampFilterHz(hz);
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `eq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: defaultFilterName(kind, f),
    kind,
    hz: f,
    q: defaultFilterQ(kind),
    gain: defaultFilterGain(kind),
    enabled: true,
    fullBand: false,
    reverb: { ...DEFAULT_REVERB_TUNE },
    delay: { ...DEFAULT_DELAY_TUNE },
    offset: { ...DEFAULT_OFFSET_TUNE },
  };
}

export function applyFilterToBiquad(
  node: BiquadFilterNode,
  f: SpectrumFilter,
) {
  const hz = clampFilterHz(f.hz);
  const q = Math.max(0.3, Math.min(18, f.q));
  const type: BiquadFilterType =
    f.kind === "cut-above"
      ? "lowpass"
      : f.kind === "cut-below"
        ? "highpass"
        : f.kind === "notch"
          ? "notch"
          : f.kind === "peak" ||
              f.kind === "band-formant" ||
              f.kind === "band-reverb" ||
              f.kind === "band-pitch" ||
              f.kind === "band-delay" ||
              f.kind === "band-offset"
            ? "peaking"
            : "bandpass";
  if (node.type !== type) node.type = type;
  const t = node.context.currentTime;
  const gain = f.kind === "peak" ? clampFilterGain(f.gain ?? 0) : 0;
  try {
    node.frequency.setTargetAtTime(hz, t, 0.018);
    node.Q.setTargetAtTime(q, t, 0.018);
    node.gain.setTargetAtTime(gain, t, 0.018);
  } catch {
    node.frequency.value = hz;
    node.Q.value = q;
    node.gain.value = gain;
  }
}

export function specMaxHz(sampleRate: number) {
  return Math.min(SPEC_MAX_HZ, (sampleRate / 2) * 0.9);
}

export function hzToSpecT(hz: number, sampleRate: number) {
  const maxHz = specMaxHz(sampleRate);
  const t =
    Math.log(clampFilterHz(hz) / SPEC_MIN_HZ) / Math.log(maxHz / SPEC_MIN_HZ);
  return Math.max(0, Math.min(1, t));
}

export function specTToHz(t: number, sampleRate: number) {
  const maxHz = specMaxHz(sampleRate);
  const u = Math.max(0, Math.min(1, t));
  return SPEC_MIN_HZ * Math.pow(maxHz / SPEC_MIN_HZ, u);
}

export function chainSpectrumFilters(
  ctx: BaseAudioContext,
  input: AudioNode,
  filters: SpectrumFilter[],
): AudioNode {
  let prev: AudioNode = input;
  for (const f of filters) {
    if (!f.enabled) continue;
    const bq = ctx.createBiquadFilter();
    applyFilterToBiquad(bq, f);
    prev.connect(bq);
    prev = bq;
  }
  return prev;
}

/** List order is the DSP chain: index 0 (top) is applied first. */
export function shiftSpectrumFilter(
  filters: SpectrumFilter[],
  id: string,
  delta: -1 | 1,
): SpectrumFilter[] {
  const i = filters.findIndex((f) => f.id === id);
  if (i < 0) return filters;
  const j = i + delta;
  if (j < 0 || j >= filters.length) return filters;
  const next = filters.slice();
  const [item] = next.splice(i, 1);
  if (!item) return filters;
  next.splice(j, 0, item);
  return next;
}

