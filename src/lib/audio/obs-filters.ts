import type { MasterFx } from "./types";

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
  | "vst";

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
    role: "入力・全体の音量を上げ下げする",
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
  {
    id: "vst",
    name: "VST 2.x プラグイン",
    rec: "situational",
    role: "外部の音声処理プラグインを読み込む",
    bar: "#475569",
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
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    node.threshold.value = 0;
    node.knee.value = 0;
    node.ratio.value = 1;
    node.attack.value = 0.003;
    node.release.value = 0.1;
    return;
  }
  node.threshold.value = -10 - a * 22;
  node.knee.value = 8;
  node.ratio.value = 2 + a * 10;
  node.attack.value = 0.008;
  node.release.value = 0.18;
}

export function applyLimiterParams(node: DynamicsCompressorNode, amount: number) {
  const a = clamp(amount, 0, 1);
  if (a < 0.02) {
    node.threshold.value = 0;
    node.knee.value = 0;
    node.ratio.value = 1;
    node.attack.value = 0.002;
    node.release.value = 0.05;
    return;
  }
  node.threshold.value = -0.4 - a * 8.5;
  node.knee.value = 0.5;
  node.ratio.value = 14 + a * 6;
  node.attack.value = 0.002;
  node.release.value = 0.06;
}

export function createEq3(ctx: BaseAudioContext, fx: MasterFx) {
  const lo = ctx.createBiquadFilter();
  lo.type = "lowshelf";
  lo.frequency.value = 200;
  lo.gain.value = fx.eqLow ?? 0;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.8;
  mid.gain.value = fx.eqMid ?? 0;

  const hi = ctx.createBiquadFilter();
  hi.type = "highshelf";
  hi.frequency.value = 5000;
  hi.gain.value = fx.eqHigh ?? 0;

  lo.connect(mid);
  mid.connect(hi);
  return { input: lo, lo, mid, hi, output: hi };
}

export function applyEq3(
  nodes: { lo: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode },
  fx: MasterFx,
) {
  nodes.lo.gain.value = fx.eqLow ?? 0;
  nodes.mid.gain.value = fx.eqMid ?? 0;
  nodes.hi.gain.value = fx.eqHigh ?? 0;
}

/** Offline envelope: gate + expander + upward compressor. */
export function processObsDynamics(
  buffer: AudioBuffer,
  fx: MasterFx,
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
