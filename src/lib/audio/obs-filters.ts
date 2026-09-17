import type { MasterFx } from "./types";
import { createHowlCancellerHandle } from "./howl-canceller";
import { clampFilterHz } from "./spectrum-filters";

export type RecMark = "yes" | "situational" | "special";

export type ObsFilterId =
  | "gain"
  | "denoise"
  | "gate"
  | "eq3"
  | "compressor"
  | "upward"
  | "expander"
  | "limiter"
  | "phase"
  | "howl";

export type ObsFilterMeta = {
  id: ObsFilterId;
  name: string;
  rec: RecMark;
  role: string;
  bar: string;
};

/** Same taxonomy as the OBS filter cheat-sheet: purpose first. */
export const OBS_FILTER_CATALOG: ObsFilterMeta[] = [
  {
    id: "gain",
    name: "ゲイン",
    rec: "special",
    role: "入力・全体の音量を上げ下げする。何段でも置ける（前段トリム＋後段メイクアップ）",
    bar: "#7c3aed",
  },
  {
    id: "denoise",
    name: "ノイズ抑制",
    rec: "yes",
    role: "PCファンや空調などの環境ノイズを減らす",
    bar: "#2563eb",
  },
  {
    id: "howl",
    name: "ハウリングキャンセラー",
    rec: "yes",
    role: "マイクとスピーカーが鳴きそうな周波数を自動でノッチする",
    bar: "#0891b2",
  },
  {
    id: "gate",
    name: "ノイズゲート",
    rec: "situational",
    role: "一定以下の小さい音をカットする",
    bar: "#16a34a",
  },
  {
    id: "eq3",
    name: "3バンドEQ",
    rec: "situational",
    role: "低音・中音・高音のバランスを整える",
    bar: "#f97316",
  },
  {
    id: "compressor",
    name: "コンプレッサー",
    rec: "yes",
    role: "大きい声を抑えて音量差を小さくする",
    bar: "#e11d48",
  },
  {
    id: "upward",
    name: "アップワードコンプレッサー",
    rec: "yes",
    role: "小さい声を持ち上げて音量差を小さくする",
    bar: "#db2777",
  },
  {
    id: "expander",
    name: "エキスパンダー",
    rec: "situational",
    role: "小さい不要音をさらに小さくする",
    bar: "#0d9488",
  },
  {
    id: "limiter",
    name: "リミッター",
    rec: "yes",
    role: "音量の上限を決めてピークを抑える",
    bar: "#6d28d9",
  },
  {
    id: "phase",
    name: "位相反転",
    rec: "special",
    role: "音声の極性を180°反転する",
    bar: "#64748b",
  },
];

export function recLabel(rec: RecMark) {
  if (rec === "yes") return { mark: "◎", text: "おすすめ", className: "text-primary" };
  if (rec === "situational")
    return { mark: "○", text: "用途に応じて", className: "text-success" };
  return { mark: "△", text: "基本不要・特殊用途", className: "text-muted-foreground" };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function num(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type CompTune = {
  /** dB. 0 = never ducks, more negative = ducks sooner. */
  thresholdDb: number;
  /** 1 = off, 20 = brick. */
  ratio: number;
  /** milliseconds. */
  attackMs: number;
  /** milliseconds. */
  releaseMs: number;
  /** Soft-knee width, dB. */
  kneeDb: number;
  /** Makeup gain after the duck, dB. */
  makeupDb: number;
  /** Dry/wet. 1 = compressed only. */
  mix: number;
};

export const DEFAULT_COMP_TUNE: CompTune = {
  thresholdDb: -19,
  ratio: 6,
  attackMs: 8,
  releaseMs: 180,
  kneeDb: 8,
  makeupDb: 0,
  mix: 1,
};

export function deriveCompFromAmount(amount: number): CompTune {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    return {
      thresholdDb: 0,
      ratio: 1,
      attackMs: 3,
      releaseMs: 100,
      kneeDb: 0,
      makeupDb: 0,
      mix: 1,
    };
  }
  return {
    thresholdDb: -10 - a * 22,
    ratio: 2 + a * 10,
    attackMs: 8,
    releaseMs: 180,
    kneeDb: 8,
    makeupDb: 0,
    mix: 1,
  };
}

export function normalizeCompTune(
  raw?: Partial<CompTune> | null,
  amount?: number,
): CompTune {
  const r = raw ?? {};
  const explicit = Number.isFinite(Number(r.thresholdDb));
  if (!explicit) return deriveCompFromAmount(amount ?? 0.4);
  return {
    thresholdDb: clamp(num(r.thresholdDb, DEFAULT_COMP_TUNE.thresholdDb), -60, 0),
    ratio: clamp(num(r.ratio, DEFAULT_COMP_TUNE.ratio), 1, 20),
    attackMs: clamp(num(r.attackMs, DEFAULT_COMP_TUNE.attackMs), 0.5, 80),
    releaseMs: clamp(num(r.releaseMs, DEFAULT_COMP_TUNE.releaseMs), 20, 1000),
    kneeDb: clamp(num(r.kneeDb, DEFAULT_COMP_TUNE.kneeDb), 0, 40),
    makeupDb: clamp(num(r.makeupDb, DEFAULT_COMP_TUNE.makeupDb), 0, 24),
    mix: clamp(num(r.mix, DEFAULT_COMP_TUNE.mix), 0, 1),
  };
}

export type LimiterTune = {
  /** Peak ceiling, dB. 0 = 0 dBFS. */
  ceilingDb: number;
  /** Lookahead delay, milliseconds. */
  lookaheadMs: number;
  /** Gain-reduction release, milliseconds. */
  releaseMs: number;
  /** Makeup after limiting, dB. */
  makeupDb: number;
  /** Dry/wet. 1 = limited only. */
  mix: number;
};

export const DEFAULT_LIMITER_TUNE: LimiterTune = {
  ceilingDb: -3.4,
  lookaheadMs: 2,
  releaseMs: 60,
  makeupDb: 0,
  mix: 1,
};

export function deriveLimiterFromAmount(amount: number): LimiterTune {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    return {
      ceilingDb: 0,
      lookaheadMs: 0,
      releaseMs: 50,
      makeupDb: 0,
      mix: 1,
    };
  }
  return {
    ceilingDb: -0.4 - a * 8.5,
    lookaheadMs: 0,
    releaseMs: 60,
    makeupDb: 0,
    mix: 1,
  };
}

export function normalizeLimiterTune(
  raw?: Partial<LimiterTune> | null,
  amount?: number,
): LimiterTune {
  const r = raw ?? {};
  const explicit = Number.isFinite(Number(r.ceilingDb));
  if (!explicit) return deriveLimiterFromAmount(amount ?? 0.35);
  return {
    ceilingDb: clamp(num(r.ceilingDb, DEFAULT_LIMITER_TUNE.ceilingDb), -12, 0),
    lookaheadMs: clamp(num(r.lookaheadMs, DEFAULT_LIMITER_TUNE.lookaheadMs), 0, 15),
    releaseMs: clamp(num(r.releaseMs, DEFAULT_LIMITER_TUNE.releaseMs), 10, 400),
    makeupDb: clamp(num(r.makeupDb, DEFAULT_LIMITER_TUNE.makeupDb), 0, 24),
    mix: clamp(num(r.mix, DEFAULT_LIMITER_TUNE.mix), 0, 1),
  };
}

export type GateTune = {
  /** Open above this RMS, dBFS. */
  thresholdDb: number;
  /** Open time, milliseconds. */
  attackMs: number;
  /** Stay open after falling below threshold, milliseconds. */
  holdMs: number;
  /** Close time, milliseconds. */
  releaseMs: number;
  /** Remaining gain when closed, 0–1. */
  floor: number;
  /** Dry/wet. 1 = gated only. */
  mix: number;
};

export const DEFAULT_GATE_TUNE: GateTune = {
  thresholdDb: -36,
  attackMs: 2,
  holdMs: 40,
  releaseMs: 80,
  floor: 0.05,
  mix: 1,
};

export function deriveGateFromAmount(amount: number): GateTune {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    return {
      thresholdDb: 0,
      attackMs: 5,
      holdMs: 0,
      releaseMs: 60,
      floor: 1,
      mix: 1,
    };
  }
  const lin = 0.008 + a * 0.07;
  return {
    thresholdDb: 20 * Math.log10(Math.max(1e-6, lin)),
    attackMs: 5,
    holdMs: 0,
    releaseMs: 60,
    floor: Math.max(0.04, 1 - a * 0.92),
    mix: 1,
  };
}

export function normalizeGateTune(
  raw?: Partial<GateTune> | null,
  amount?: number,
): GateTune {
  const r = raw ?? {};
  const explicit = Number.isFinite(Number(r.thresholdDb));
  if (!explicit) return deriveGateFromAmount(amount ?? 0.35);
  return {
    thresholdDb: clamp(num(r.thresholdDb, DEFAULT_GATE_TUNE.thresholdDb), -80, 0),
    attackMs: clamp(num(r.attackMs, DEFAULT_GATE_TUNE.attackMs), 0.5, 40),
    holdMs: clamp(num(r.holdMs, DEFAULT_GATE_TUNE.holdMs), 0, 400),
    releaseMs: clamp(num(r.releaseMs, DEFAULT_GATE_TUNE.releaseMs), 10, 800),
    floor: clamp(num(r.floor, DEFAULT_GATE_TUNE.floor), 0, 1),
    mix: clamp(num(r.mix, DEFAULT_GATE_TUNE.mix), 0, 1),
  };
}

/** Shared shape for upward compressor and expander (both act below threshold). */
export type BelowTune = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  mix: number;
};

export const DEFAULT_UPWARD_TUNE: BelowTune = {
  thresholdDb: -18,
  ratio: 2,
  attackMs: 8,
  releaseMs: 100,
  mix: 1,
};

export const DEFAULT_EXPANDER_TUNE: BelowTune = {
  thresholdDb: -40,
  ratio: 2,
  attackMs: 5,
  releaseMs: 80,
  mix: 1,
};

export function deriveUpwardFromAmount(amount: number): BelowTune {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    return { thresholdDb: -15, ratio: 1, attackMs: 8, releaseMs: 80, mix: 1 };
  }
  return {
    thresholdDb: -15,
    ratio: 1 + a * 3,
    attackMs: 8,
    releaseMs: 80,
    mix: 1,
  };
}

export function deriveExpanderFromAmount(amount: number): BelowTune {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    return { thresholdDb: -26, ratio: 1, attackMs: 5, releaseMs: 60, mix: 1 };
  }
  const lin = 0.05 + a * 0.04;
  return {
    thresholdDb: 20 * Math.log10(Math.max(1e-6, lin)),
    ratio: 1 + a * 1.4,
    attackMs: 5,
    releaseMs: 60,
    mix: 1,
  };
}

function clampBelowTune(raw: Partial<BelowTune>, fallback: BelowTune): BelowTune {
  return {
    thresholdDb: clamp(num(raw.thresholdDb, fallback.thresholdDb), -80, 0),
    ratio: clamp(num(raw.ratio, fallback.ratio), 1, 8),
    attackMs: clamp(num(raw.attackMs, fallback.attackMs), 0.5, 80),
    releaseMs: clamp(num(raw.releaseMs, fallback.releaseMs), 10, 800),
    mix: clamp(num(raw.mix, fallback.mix), 0, 1),
  };
}

export function normalizeUpwardTune(
  raw?: Partial<BelowTune> | null,
  amount?: number,
): BelowTune {
  const r = raw ?? {};
  if (!Number.isFinite(Number(r.thresholdDb))) {
    return deriveUpwardFromAmount(amount ?? 0.4);
  }
  return clampBelowTune(r, DEFAULT_UPWARD_TUNE);
}

export function normalizeExpanderTune(
  raw?: Partial<BelowTune> | null,
  amount?: number,
): BelowTune {
  const r = raw ?? {};
  if (!Number.isFinite(Number(r.thresholdDb))) {
    return deriveExpanderFromAmount(amount ?? 0.35);
  }
  return clampBelowTune(r, DEFAULT_EXPANDER_TUNE);
}

export type DenoiseTune = {
  /** Dry/wet of the cleaned path. */
  mix: number;
  /** How hard the HP/LP shave. */
  attack: number;
  /** Extra expander on quiet parts. */
  gateLink: boolean;
  /** Expander threshold when gateLink is on, dBFS. */
  thresholdDb: number;
};

export const DEFAULT_DENOISE_TUNE: DenoiseTune = {
  mix: 1,
  attack: 0.4,
  gateLink: false,
  thresholdDb: -38,
};

export function deriveDenoiseFromAmount(amount: number): DenoiseTune {
  const a = clamp(amount, 0, 1);
  return {
    mix: 1,
    attack: a,
    gateLink: false,
    thresholdDb: -38,
  };
}

export type NoisePrint = {
  rmsDb: number;
  hiss: number;
  capturedAt: number;
};

export function denoiseFromNoisePrint(
  print: NoisePrint,
  prev?: Partial<DenoiseTune>,
): DenoiseTune {
  const rms = clamp(print.rmsDb, -80, 0);
  const hiss = clamp(print.hiss, 0, 1);
  const loud = clamp((rms + 62) / 36, 0, 1);
  return {
    mix: clamp(num(prev?.mix, 1), 0, 1),
    attack: clamp(0.16 + loud * 0.42 + hiss * 0.28, 0.12, 0.88),
    gateLink: rms > -54,
    thresholdDb: clamp(rms + 12, -72, -20),
  };
}

export function normalizeDenoiseTune(
  raw?: Partial<DenoiseTune> | null,
  amount?: number,
): DenoiseTune {
  const r = raw ?? {};
  const explicit = Number.isFinite(Number(r.attack));
  if (!explicit) return deriveDenoiseFromAmount(amount ?? 0.4);
  return {
    mix: clamp(num(r.mix, DEFAULT_DENOISE_TUNE.mix), 0, 1),
    attack: clamp(num(r.attack, DEFAULT_DENOISE_TUNE.attack), 0, 1),
    gateLink: r.gateLink === true,
    thresholdDb: clamp(
      num(r.thresholdDb, DEFAULT_DENOISE_TUNE.thresholdDb),
      -80,
      0,
    ),
  };
}

export type HowlTune = {
  /** How quickly a peak is locked as feedback. */
  speed: number;
  /** Notch count, Q, and detection strictness. */
  depth: number;
  /** How long a locked notch stays after the peak fades. */
  hold: number;
};

export const DEFAULT_HOWL_TUNE: HowlTune = {
  speed: 0.5,
  depth: 0.55,
  hold: 0.45,
};

export function deriveHowlFromAmount(amount: number): HowlTune {
  const a = clamp(amount, 0, 1);
  return {
    speed: 0.35 + a * 0.3,
    depth: a,
    hold: 0.5,
  };
}

export function normalizeHowlTune(
  raw?: Partial<HowlTune> | null,
  amount?: number,
): HowlTune {
  const r = raw ?? {};
  if (!Number.isFinite(Number(r.depth))) {
    return deriveHowlFromAmount(amount ?? 0.55);
  }
  return {
    speed: clamp(num(r.speed, DEFAULT_HOWL_TUNE.speed), 0, 1),
    depth: clamp(num(r.depth, DEFAULT_HOWL_TUNE.depth), 0, 1),
    hold: clamp(num(r.hold, DEFAULT_HOWL_TUNE.hold), 0, 1),
  };
}

export type Eq3Tune = {
  lowHz: number;
  lowQ: number;
  lowGain: number;
  midHz: number;
  midQ: number;
  midGain: number;
  highHz: number;
  highQ: number;
  highGain: number;
};

export const DEFAULT_EQ3_TUNE: Eq3Tune = {
  lowHz: 200,
  lowQ: 0.7,
  lowGain: 0,
  midHz: 1000,
  midQ: 0.8,
  midGain: 0,
  highHz: 5000,
  highQ: 0.7,
  highGain: 0,
};

export function normalizeEq3Tune(
  raw?: Partial<Eq3Tune> | null,
  gains?: { eqLow?: number; eqMid?: number; eqHigh?: number },
): Eq3Tune {
  const r = raw ?? {};
  const g = gains ?? {};
  return {
    lowHz: clamp(num(r.lowHz, DEFAULT_EQ3_TUNE.lowHz), 40, 800),
    lowQ: clamp(num(r.lowQ, DEFAULT_EQ3_TUNE.lowQ), 0.3, 8),
    lowGain: clamp(num(r.lowGain, g.eqLow ?? DEFAULT_EQ3_TUNE.lowGain), -12, 12),
    midHz: clamp(num(r.midHz, DEFAULT_EQ3_TUNE.midHz), 200, 4000),
    midQ: clamp(num(r.midQ, DEFAULT_EQ3_TUNE.midQ), 0.3, 8),
    midGain: clamp(num(r.midGain, g.eqMid ?? DEFAULT_EQ3_TUNE.midGain), -12, 12),
    highHz: clamp(num(r.highHz, DEFAULT_EQ3_TUNE.highHz), 1500, 16000),
    highQ: clamp(num(r.highQ, DEFAULT_EQ3_TUNE.highQ), 0.3, 8),
    highGain: clamp(
      num(r.highGain, g.eqHigh ?? DEFAULT_EQ3_TUNE.highGain),
      -12,
      12,
    ),
  };
}

export const DEFAULT_MASTER_FX: MasterFx = {
  volume: 1,
  pitchSemitones: 0,
  formantDb: 0,
  reverbMix: 0.15,
  compressor: 0.3,
  noise: 0,
  gate: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  upward: 0,
  expander: 0,
  limiter: 0.25,
  phaseInvert: false,
  preset: "original",
};

export function normalizeMasterFx(raw?: Partial<MasterFx> | null): MasterFx {
  const r = raw ?? {};
  const preset = r.preset;
  return {
    volume: clamp(num(r.volume, DEFAULT_MASTER_FX.volume), 0, 1.5),
    pitchSemitones: clamp(num(r.pitchSemitones, 0), -12, 12),
    formantDb: clamp(num(r.formantDb, 0), -12, 12),
    reverbMix: clamp(num(r.reverbMix, DEFAULT_MASTER_FX.reverbMix), 0, 1),
    compressor: clamp(num(r.compressor, DEFAULT_MASTER_FX.compressor), 0, 1),
    noise: clamp(num(r.noise, 0), 0, 1),
    gate: clamp(num(r.gate, 0), 0, 1),
    eqLow: clamp(num(r.eqLow, 0), -12, 12),
    eqMid: clamp(num(r.eqMid, 0), -12, 12),
    eqHigh: clamp(num(r.eqHigh, 0), -12, 12),
    upward: clamp(num(r.upward, 0), 0, 1),
    expander: clamp(num(r.expander, 0), 0, 1),
    limiter: clamp(num(r.limiter, DEFAULT_MASTER_FX.limiter), 0, 1),
    phaseInvert: !!r.phaseInvert,
    preset:
      preset === "studio" ||
      preset === "radio" ||
      preset === "hall" ||
      preset === "whisper" ||
      preset === "bright" ||
      preset === "original"
        ? preset
        : "original",
  };
}

export function applyCompressorParams(
  node: DynamicsCompressorNode,
  amount: number,
) {
  applyCompNode(node, deriveCompFromAmount(amount));
}

function applyCompNode(node: DynamicsCompressorNode, c: CompTune) {
  node.threshold.value = c.thresholdDb;
  node.knee.value = c.kneeDb;
  node.ratio.value = c.ratio;
  node.attack.value = c.attackMs / 1000;
  node.release.value = c.releaseMs / 1000;
}

function setParam(ctx: BaseAudioContext, param: AudioParam, value: number) {
  const t = "currentTime" in ctx ? ctx.currentTime : 0;
  try {
    param.setTargetAtTime(value, t, 0.02);
  } catch {
    param.value = value;
  }
}

export function applyCompTuneToGraph(
  ctx: BaseAudioContext,
  node: DynamicsCompressorNode,
  makeup: GainNode,
  dryG: GainNode,
  wetG: GainNode,
  ins: ObsInsert,
) {
  const c = normalizeCompTune(ins.comp, ins.amount);
  setParam(ctx, node.threshold, c.thresholdDb);
  setParam(ctx, node.knee, c.kneeDb);
  setParam(ctx, node.ratio, c.ratio);
  setParam(ctx, node.attack, Math.max(0.001, c.attackMs / 1000));
  setParam(ctx, node.release, Math.max(0.02, c.releaseMs / 1000));
  setParam(ctx, makeup.gain, Math.pow(10, c.makeupDb / 20));
  setParam(ctx, dryG.gain, 1 - c.mix);
  setParam(ctx, wetG.gain, c.mix);
}

export function applyLimiterParams(node: DynamicsCompressorNode, amount: number) {
  applyLimiterNode(node, deriveLimiterFromAmount(amount));
}

function applyLimiterNode(node: DynamicsCompressorNode, l: LimiterTune) {
  node.threshold.value = l.ceilingDb;
  node.knee.value = 0.3;
  node.ratio.value = 20;
  node.attack.value = 0.001;
  node.release.value = Math.max(0.02, l.releaseMs / 1000);
}

export function applyLimiterTuneToGraph(
  ctx: BaseAudioContext,
  node: DynamicsCompressorNode,
  makeup: GainNode,
  dryG: GainNode,
  wetG: GainNode,
  ins: ObsInsert,
) {
  const l = normalizeLimiterTune(ins.limiter, ins.amount);
  setParam(ctx, node.threshold, l.ceilingDb);
  setParam(ctx, node.knee, 0.3);
  setParam(ctx, node.ratio, 20);
  setParam(ctx, node.attack, 0.001);
  setParam(ctx, node.release, Math.max(0.02, l.releaseMs / 1000));
  setParam(ctx, makeup.gain, Math.pow(10, l.makeupDb / 20));
  setParam(ctx, dryG.gain, 1 - l.mix);
  setParam(ctx, wetG.gain, l.mix);
}

function applyLimiterWorklet(
  ctx: BaseAudioContext,
  node: AudioWorkletNode,
  ins: ObsInsert,
) {
  const l = normalizeLimiterTune(ins.limiter, ins.amount);
  const t = "currentTime" in ctx ? ctx.currentTime : 0;
  const set = (name: string, value: number) => {
    const p = node.parameters.get(name);
    if (!p) return;
    try {
      p.setTargetAtTime(value, t, 0.02);
    } catch {
      p.value = value;
    }
  };
  set("ceiling", Math.pow(10, l.ceilingDb / 20));
  set("lookahead", l.lookaheadMs);
  set("release", l.releaseMs);
  set("makeup", Math.pow(10, l.makeupDb / 20));
  set("mix", l.mix);
}

function tryLimiterWorklet(ctx: BaseAudioContext): AudioWorkletNode | null {
  if (typeof AudioWorkletNode === "undefined") return null;
  try {
    return new AudioWorkletNode(ctx, "peak-limiter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    return null;
  }
}

export function createEq3(ctx: BaseAudioContext, fx: Partial<ObsInsert> | Eq3Tune) {
  const t = normalizeEq3Tune(
    "lowHz" in fx ? (fx as Eq3Tune) : (fx as Partial<ObsInsert>).eq3Tune,
    fx as { eqLow?: number; eqMid?: number; eqHigh?: number },
  );
  const lo = ctx.createBiquadFilter();
  lo.type = "lowshelf";
  lo.frequency.value = t.lowHz;
  lo.Q.value = t.lowQ;
  lo.gain.value = t.lowGain;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = t.midHz;
  mid.Q.value = t.midQ;
  mid.gain.value = t.midGain;

  const hi = ctx.createBiquadFilter();
  hi.type = "highshelf";
  hi.frequency.value = t.highHz;
  hi.Q.value = t.highQ;
  hi.gain.value = t.highGain;

  lo.connect(mid);
  mid.connect(hi);
  return { input: lo, lo, mid, hi, output: hi };
}

export function applyEq3(
  nodes: { lo: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode },
  fx: Partial<ObsInsert> | Eq3Tune,
) {
  const t = normalizeEq3Tune(
    "lowHz" in fx ? (fx as Eq3Tune) : (fx as Partial<ObsInsert>).eq3Tune,
    fx as { eqLow?: number; eqMid?: number; eqHigh?: number },
  );
  const now = (n: BiquadFilterNode) =>
    "currentTime" in n.context ? n.context.currentTime : 0;
  const set = (node: BiquadFilterNode, hz: number, q: number, gain: number) => {
    const t0 = now(node);
    try {
      node.frequency.setTargetAtTime(hz, t0, 0.02);
      node.Q.setTargetAtTime(q, t0, 0.02);
      node.gain.setTargetAtTime(gain, t0, 0.02);
    } catch {
      node.frequency.value = hz;
      node.Q.value = q;
      node.gain.value = gain;
    }
  };
  set(nodes.lo, t.lowHz, t.lowQ, t.lowGain);
  set(nodes.mid, t.midHz, t.midQ, t.midGain);
  set(nodes.hi, t.highHz, t.highQ, t.highGain);
}

/** Offline envelope: gate + expander + upward compressor. */
export function processObsDynamics(
  buffer: AudioBuffer,
  fx: { gate?: number; upward?: number; expander?: number },
): AudioBuffer {
  const gateAmt = fx.gate ?? 0;
  const upAmt = fx.upward ?? 0;
  const expAmt = fx.expander ?? 0;
  if (gateAmt < 0.02 && upAmt < 0.02 && expAmt < 0.02) return buffer;

  const out = new AudioBuffer({
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  const dests = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    out.getChannelData(i),
  );

  const sr = buffer.sampleRate;
  const atk = 1 - Math.exp(-1 / (sr * 0.008));
  const rel = 1 - Math.exp(-1 / (sr * 0.08));
  const gAtk = 1 - Math.exp(-1 / (sr * 0.005));
  const gRel = 1 - Math.exp(-1 / (sr * 0.06));
  const gateThresh = 0.008 + gateAmt * 0.07;
  const gateFloor = Math.max(0.04, 1 - gateAmt * 0.92);
  const upThresh = 0.18;
  const expThresh = 0.05 + expAmt * 0.04;

  let env = 0;
  let g = 1;
  for (let i = 0; i < buffer.length; i++) {
    let sq = 0;
    for (const ch of chans) {
      const s = ch[i] ?? 0;
      sq += s * s;
    }
    const rms = Math.sqrt(sq / chans.length);
    env += (rms - env) * (rms > env ? atk : rel);

    let target = 1;
    if (gateAmt > 0.02) target *= env > gateThresh ? 1 : gateFloor;
    if (expAmt > 0.02 && env < expThresh) {
      const x = Math.max(1e-4, env / expThresh);
      target *= Math.pow(x, expAmt * 1.4);
    }
    if (upAmt > 0.02 && env < upThresh) {
      const lack = (upThresh - env) / upThresh;
      target *= 1 + upAmt * lack * 1.6;
    }
    if (target > 6) target = 6;
    g += (target - g) * (target > g ? gAtk : gRel);

    for (let c = 0; c < dests.length; c++) {
      dests[c]![i] = (chans[c]![i] ?? 0) * g;
    }
  }
  return out;
}

export const MAX_OBS_INSERTS = 12;

export const OBS_INSERT_KINDS = new Set<ObsFilterId>(
  OBS_FILTER_CATALOG.map((r) => r.id),
);

export type ObsInsert = {
  id: string;
  kind: ObsFilterId;
  name: string;
  enabled: boolean;
  /** 0–1.5 for gain, 0–1 for dynamics / denoise. Unused for eq3. */
  amount: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  phaseInvert: boolean;
  /** Default true: process the whole spectrum. Uncheck to pick a band. */
  fullBand: boolean;
  hz: number;
  q: number;
  comp: CompTune;
  limiter: LimiterTune;
  gate: GateTune;
  upwardTune: BelowTune;
  expanderTune: BelowTune;
  denoiseTune: DenoiseTune;
  howlTune: HowlTune;
  eq3Tune: Eq3Tune;
};

export function catalogMeta(kind: ObsFilterId) {
  return OBS_FILTER_CATALOG.find((r) => r.id === kind);
}

export function defaultInsertAmount(kind: ObsFilterId) {
  if (kind === "gain") return 1;
  if (kind === "phase") return 1;
  if (kind === "eq3") return 0;
  if (kind === "limiter") return 0.35;
  if (kind === "compressor" || kind === "upward") return 0.4;
  if (kind === "denoise") return 0.4;
  if (kind === "howl") return 0.55;
  return 0.35;
}

function newInsertId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ins-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newObsInsert(
  kind: ObsFilterId,
  patch?: Partial<ObsInsert>,
): ObsInsert {
  const meta = catalogMeta(kind);
  const eq3Tune = normalizeEq3Tune(patch?.eq3Tune, {
    eqLow: patch?.eqLow,
    eqMid: patch?.eqMid,
    eqHigh: patch?.eqHigh,
  });
  return {
    id: patch?.id || newInsertId(),
    kind,
    name: patch?.name || meta?.name || kind,
    enabled: patch?.enabled !== false,
    amount: clamp(
      num(patch?.amount, defaultInsertAmount(kind)),
      0,
      kind === "gain" ? 1.5 : 1,
    ),
    eqLow: eq3Tune.lowGain,
    eqMid: eq3Tune.midGain,
    eqHigh: eq3Tune.highGain,
    phaseInvert: patch?.phaseInvert ?? kind === "phase",
    fullBand: patch?.fullBand !== false,
    hz: clampFilterHz(num(patch?.hz, 1000)),
    q: clamp(num(patch?.q, 1.4), 0.3, 18),
    comp: normalizeCompTune(patch?.comp, patch?.amount),
    limiter: normalizeLimiterTune(
      patch?.limiter ?? (patch?.amount == null ? DEFAULT_LIMITER_TUNE : undefined),
      patch?.amount,
    ),
    gate: normalizeGateTune(
      patch?.gate ?? (patch?.amount == null ? DEFAULT_GATE_TUNE : undefined),
      patch?.amount,
    ),
    upwardTune: normalizeUpwardTune(
      patch?.upwardTune ??
        (patch?.amount == null ? DEFAULT_UPWARD_TUNE : undefined),
      patch?.amount,
    ),
    expanderTune: normalizeExpanderTune(
      patch?.expanderTune ??
        (patch?.amount == null ? DEFAULT_EXPANDER_TUNE : undefined),
      patch?.amount,
    ),
    denoiseTune: normalizeDenoiseTune(
      patch?.denoiseTune ??
        (patch?.amount == null ? DEFAULT_DENOISE_TUNE : undefined),
      patch?.amount,
    ),
    howlTune: normalizeHowlTune(
      patch?.howlTune ??
        (patch?.amount == null ? DEFAULT_HOWL_TUNE : undefined),
      patch?.amount,
    ),
    eq3Tune,
  };
}

export function normalizeObsInsert(raw: Partial<ObsInsert>): ObsInsert | null {
  const kind = raw.kind as ObsFilterId;
  if (!OBS_INSERT_KINDS.has(kind)) return null;
  return newObsInsert(kind, raw);
}

/** Rename duplicates as 1段目 / 2段目 so two gains stay distinct. */
export function labelObsInserts(list: ObsInsert[]): ObsInsert[] {
  const totals = new Map<ObsFilterId, number>();
  for (const ins of list) {
    totals.set(ins.kind, (totals.get(ins.kind) ?? 0) + 1);
  }
  const seen = new Map<ObsFilterId, number>();
  return list.map((ins) => {
    const total = totals.get(ins.kind) ?? 1;
    const n = (seen.get(ins.kind) ?? 0) + 1;
    seen.set(ins.kind, n);
    const base = catalogMeta(ins.kind)?.name ?? ins.kind;
    return {
      ...ins,
      name: total > 1 ? `${base} ${n}段目` : base,
    };
  });
}

export function shiftObsInsert(
  list: ObsInsert[],
  id: string,
  delta: -1 | 1,
): ObsInsert[] {
  const i = list.findIndex((f) => f.id === id);
  if (i < 0) return list;
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(i, 1);
  if (!item) return list;
  next.splice(j, 0, item);
  return labelObsInserts(next);
}

/** Old snapshots stored amounts on MasterFx. Promote them to inserts. */
export function insertsFromMaster(fx: MasterFx): ObsInsert[] {
  const out: ObsInsert[] = [];
  if ((fx.noise ?? 0) > 0.02) {
    out.push(newObsInsert("denoise", { amount: fx.noise }));
  }
  if ((fx.gate ?? 0) > 0.02) {
    out.push(newObsInsert("gate", { amount: fx.gate }));
  }
  const eq =
    Math.abs(fx.eqLow ?? 0) +
    Math.abs(fx.eqMid ?? 0) +
    Math.abs(fx.eqHigh ?? 0);
  if (eq > 0.15) {
    out.push(
      newObsInsert("eq3", {
        eqLow: fx.eqLow,
        eqMid: fx.eqMid,
        eqHigh: fx.eqHigh,
      }),
    );
  }
  if ((fx.compressor ?? 0) > 0.02) {
    out.push(newObsInsert("compressor", { amount: fx.compressor }));
  }
  if ((fx.upward ?? 0) > 0.02) {
    out.push(newObsInsert("upward", { amount: fx.upward }));
  }
  if ((fx.expander ?? 0) > 0.02) {
    out.push(newObsInsert("expander", { amount: fx.expander }));
  }
  if ((fx.limiter ?? 0) > 0.02) {
    out.push(newObsInsert("limiter", { amount: fx.limiter }));
  }
  if (fx.phaseInvert) {
    out.push(newObsInsert("phase", { phaseInvert: true }));
  }
  return labelObsInserts(out);
}

export function noiseParams(amount: number) {
  const a = clamp(amount, 0, 1);
  return {
    amount: a,
    hp: 20 + a * 160,
    lp: 20000 - a * 7000,
  };
}

export type ObsInsertHandle = {
  id: string;
  kind: ObsFilterId;
  input: AudioNode;
  output: AudioNode;
  apply: (next: ObsInsert) => void;
  dispose: () => void;
};

export function createObsInsertHandle(
  ctx: BaseAudioContext,
  ins: ObsInsert,
  workletFactory?: () => AudioWorkletNode | null,
): ObsInsertHandle {
  const nodes: AudioNode[] = [];
  const track = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };
  const dispose = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
  };

  if (ins.kind === "gain") {
    const g = track(ctx.createGain());
    const apply = (next: ObsInsert) => {
      g.gain.value = clamp(next.amount, 0, 1.5);
    };
    apply(ins);
    return { id: ins.id, kind: ins.kind, input: g, output: g, apply, dispose };
  }

  if (ins.kind === "denoise") {
    const input = track(ctx.createGain());
    const dryG = track(ctx.createGain());
    const wetG = track(ctx.createGain());
    const output = track(ctx.createGain());
    const hp = track(ctx.createBiquadFilter());
    hp.type = "highpass";
    hp.Q.value = 0.7;
    const lp = track(ctx.createBiquadFilter());
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    const worklet = workletFactory?.() ?? null;
    input.connect(dryG);
    dryG.connect(output);
    input.connect(hp);
    hp.connect(lp);
    if (worklet) {
      track(worklet);
      lp.connect(worklet);
      worklet.connect(wetG);
    } else {
      lp.connect(wetG);
    }
    wetG.connect(output);
    const apply = (next: ObsInsert) => {
      const d = normalizeDenoiseTune(next.denoiseTune, next.amount);
      const p = noiseParams(d.attack);
      hp.frequency.value = p.hp;
      lp.frequency.value = p.lp;
      dryG.gain.value = 1 - d.mix;
      wetG.gain.value = d.mix;
      if (!worklet) return;
      const t = "currentTime" in ctx ? ctx.currentTime : 0;
      const set = (name: string, value: number) => {
        const param = worklet.parameters.get(name);
        if (!param) return;
        try {
          param.setTargetAtTime(value, t, 0.03);
        } catch {
          param.value = value;
        }
      };
      set("gate", 0);
      set("upward", 0);
      set("expander", 0);
      set("gThresh", 0);
      set("uRatio", 1);
      if (d.gateLink) {
        set("eThresh", Math.pow(10, d.thresholdDb / 20));
        set("eRatio", 1.3 + d.attack * 1.7);
        set("eAtk", 8);
        set("eRel", 90);
        set("eMix", 1);
      } else {
        set("eRatio", 1);
        set("eMix", 1);
      }
    };
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input,
      output,
      apply,
      dispose,
    };
  }

  if (ins.kind === "eq3") {
    const eq = createEq3(ctx, ins);
    track(eq.lo);
    track(eq.mid);
    track(eq.hi);
    const apply = (next: ObsInsert) => applyEq3(eq, next);
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input: eq.input,
      output: eq.output,
      apply,
      dispose,
    };
  }

  if (ins.kind === "compressor") {
    const input = track(ctx.createGain());
    const dryG = track(ctx.createGain());
    const wetG = track(ctx.createGain());
    const node = track(ctx.createDynamicsCompressor());
    const makeup = track(ctx.createGain());
    const output = track(ctx.createGain());
    input.connect(dryG);
    dryG.connect(output);
    input.connect(node);
    node.connect(makeup);
    makeup.connect(wetG);
    wetG.connect(output);
    const apply = (next: ObsInsert) => {
      applyCompTuneToGraph(ctx, node, makeup, dryG, wetG, next);
    };
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input,
      output,
      apply,
      dispose,
    };
  }

  if (ins.kind === "limiter") {
    const worklet = tryLimiterWorklet(ctx);
    if (worklet) {
      track(worklet);
      const apply = (next: ObsInsert) => applyLimiterWorklet(ctx, worklet, next);
      apply(ins);
      return {
        id: ins.id,
        kind: ins.kind,
        input: worklet,
        output: worklet,
        apply,
        dispose,
      };
    }
    const input = track(ctx.createGain());
    const dryG = track(ctx.createGain());
    const wetG = track(ctx.createGain());
    const node = track(ctx.createDynamicsCompressor());
    const makeup = track(ctx.createGain());
    const output = track(ctx.createGain());
    input.connect(dryG);
    dryG.connect(output);
    input.connect(node);
    node.connect(makeup);
    makeup.connect(wetG);
    wetG.connect(output);
    const apply = (next: ObsInsert) => {
      applyLimiterTuneToGraph(ctx, node, makeup, dryG, wetG, next);
    };
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input,
      output,
      apply,
      dispose,
    };
  }

  if (ins.kind === "phase") {
    const g = track(ctx.createGain());
    const apply = (next: ObsInsert) => {
      g.gain.value = next.phaseInvert ? -1 : 1;
    };
    apply(ins);
    return { id: ins.id, kind: ins.kind, input: g, output: g, apply, dispose };
  }

  if (ins.kind === "howl") {
    return createHowlCancellerHandle(ctx, ins);
  }

  const worklet = workletFactory?.() ?? null;
  if (worklet) {
    track(worklet);
    const apply = (next: ObsInsert) => {
      const t = "currentTime" in ctx ? ctx.currentTime : 0;
      const set = (name: string, value: number) => {
        const p = worklet.parameters.get(name);
        if (!p) return;
        try {
          p.setTargetAtTime(value, t, 0.03);
        } catch {
          p.value = value;
        }
      };
      set("gate", next.kind === "gate" ? 1 : 0);
      set("upward", 0);
      set("expander", 0);
      if (next.kind === "gate") {
        const g = normalizeGateTune(next.gate, next.amount);
        set("gThresh", Math.pow(10, g.thresholdDb / 20));
        set("gAtk", g.attackMs);
        set("gHold", g.holdMs);
        set("gRel", g.releaseMs);
        set("gFloor", g.floor);
        set("gMix", g.mix);
      } else {
        set("gThresh", 0);
        set("gFloor", 1);
        set("gMix", 1);
      }
      if (next.kind === "upward") {
        const u = normalizeUpwardTune(next.upwardTune, next.amount);
        set("uThresh", Math.pow(10, u.thresholdDb / 20));
        set("uRatio", u.ratio);
        set("uAtk", u.attackMs);
        set("uRel", u.releaseMs);
        set("uMix", u.mix);
      } else {
        set("uRatio", 1);
        set("uMix", 1);
      }
      if (next.kind === "expander") {
        const e = normalizeExpanderTune(next.expanderTune, next.amount);
        set("eThresh", Math.pow(10, e.thresholdDb / 20));
        set("eRatio", e.ratio);
        set("eAtk", e.attackMs);
        set("eRel", e.releaseMs);
        set("eMix", e.mix);
      } else {
        set("eRatio", 1);
        set("eMix", 1);
      }
    };
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input: worklet,
      output: worklet,
      apply,
      dispose,
    };
  }

  const passthrough = track(ctx.createGain());
  passthrough.gain.value = 1;
  return {
    id: ins.id,
    kind: ins.kind,
    input: passthrough,
    output: passthrough,
    apply: () => {},
    dispose,
  };
}

export function connectInsertChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  inserts: ObsInsert[],
  workletFactory?: () => AudioWorkletNode | null,
): AudioNode {
  let prev: AudioNode = source;
  for (const ins of inserts) {
    if (!ins.enabled) continue;
    const handle = createObsInsertHandle(ctx, ins, workletFactory);
    prev.connect(handle.input);
    prev = handle.output;
  }
  return prev;
}
