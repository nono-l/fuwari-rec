import type { MasterFx } from "./types";
import { createHowlCancellerHandle } from "./howl-canceller";

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

export function createEq3(
  ctx: BaseAudioContext,
  fx: { eqLow?: number; eqMid?: number; eqHigh?: number },
) {
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
  fx: { eqLow?: number; eqMid?: number; eqHigh?: number },
) {
  nodes.lo.gain.value = fx.eqLow ?? 0;
  nodes.mid.gain.value = fx.eqMid ?? 0;
  nodes.hi.gain.value = fx.eqHigh ?? 0;
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
    eqLow: clamp(num(patch?.eqLow, 0), -12, 12),
    eqMid: clamp(num(patch?.eqMid, 0), -12, 12),
    eqHigh: clamp(num(patch?.eqHigh, 0), -12, 12),
    phaseInvert: patch?.phaseInvert ?? kind === "phase",
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
    const hp = track(ctx.createBiquadFilter());
    hp.type = "highpass";
    hp.Q.value = 0.7;
    const lp = track(ctx.createBiquadFilter());
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    hp.connect(lp);
    const apply = (next: ObsInsert) => {
      const p = noiseParams(next.amount);
      hp.frequency.value = p.hp;
      lp.frequency.value = p.lp;
    };
    apply(ins);
    return { id: ins.id, kind: ins.kind, input: hp, output: lp, apply, dispose };
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
    const node = track(ctx.createDynamicsCompressor());
    const apply = (next: ObsInsert) => applyCompressorParams(node, next.amount);
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input: node,
      output: node,
      apply,
      dispose,
    };
  }

  if (ins.kind === "limiter") {
    const node = track(ctx.createDynamicsCompressor());
    const apply = (next: ObsInsert) => applyLimiterParams(node, next.amount);
    apply(ins);
    return {
      id: ins.id,
      kind: ins.kind,
      input: node,
      output: node,
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
      set("gate", next.kind === "gate" ? next.amount : 0);
      set("upward", next.kind === "upward" ? next.amount : 0);
      set("expander", next.kind === "expander" ? next.amount : 0);
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
