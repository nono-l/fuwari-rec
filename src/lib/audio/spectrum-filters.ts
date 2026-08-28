export type SpectrumFilterKind =
  | "cut-above"
  | "cut-below"
  | "notch"
  | "keep-band"
  | "peak";

export type SpectrumFilter = {
  id: string;
  name: string;
  kind: SpectrumFilterKind;
  hz: number;
  q: number;
  /** Peaking EQ gain in dB. Unused (0) for other kinds. */
  gain: number;
  enabled: boolean;
};

export const SPEC_MIN_HZ = 40;
export const SPEC_MAX_HZ = 16000;
export const MAX_SPECTRUM_FILTERS = 8;

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
  if (kind === "keep-band" || kind === "peak") return 1.4;
  return 0.7;
}

export function defaultFilterGain(kind: SpectrumFilterKind) {
  return kind === "peak" ? 6 : 0;
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
  return kind === "peak";
}

export function defaultFilterName(kind: SpectrumFilterKind, hz: number) {
  const short =
    kind === "cut-above"
      ? "高域カット"
      : kind === "cut-below"
        ? "低域カット"
        : kind === "notch"
          ? "ノッチ"
          : kind === "peak"
            ? "帯ゲイン"
            : "帯域通過";
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

export function usesBandWidth(kind: SpectrumFilterKind) {
  return kind === "notch" || kind === "keep-band" || kind === "peak";
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
          : f.kind === "peak"
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

