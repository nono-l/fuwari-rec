import type { ObsInsert, ObsInsertHandle } from "./obs-filters";

const NOTCH_MAX = 6;
const PARK_HZ = 18;
const MIN_HZ = 180;
const MAX_HZ = 8000;
const MATCH_RATIO = 1.08;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function isOffline(ctx: BaseAudioContext) {
  return (
    typeof OfflineAudioContext !== "undefined" &&
    ctx instanceof OfflineAudioContext
  );
}

function notchCount(amount: number) {
  const a = clamp(amount, 0, 1);
  return Math.round(2 + a * 4);
}

function notchQ(amount: number) {
  return 14 + clamp(amount, 0, 1) * 26;
}

type Slot = {
  hz: number;
  pending: number;
  miss: number;
  live: boolean;
};

/**
 * Adaptive notch bank for live acoustic feedback.
 * Parks unused notches at inaudible bass so the chain stays connected.
 */
export function createHowlCancellerHandle(
  ctx: BaseAudioContext,
  ins: { id: string; kind: ObsInsert["kind"]; amount: number },
): ObsInsertHandle {
  const input = ctx.createGain();
  input.gain.value = 1;
  const notches: BiquadFilterNode[] = [];
  let prev: AudioNode = input;
  for (let i = 0; i < NOTCH_MAX; i++) {
    const n = ctx.createBiquadFilter();
    n.type = "notch";
    n.frequency.value = PARK_HZ;
    n.Q.value = 8;
    prev.connect(n);
    prev = n;
    notches.push(n);
  }
  const output = prev;

  const slots: Slot[] = notches.map(() => ({
    hz: PARK_HZ,
    pending: 0,
    miss: 0,
    live: false,
  }));

  let amount = clamp(ins.amount, 0, 1);
  let raf = 0;
  let disposed = false;
  let analyser: AnalyserNode | null = null;
  let bins: Float32Array | null = null;

  const park = (i: number) => {
    const n = notches[i]!;
    const slot = slots[i]!;
    slot.hz = PARK_HZ;
    slot.pending = 0;
    slot.miss = 0;
    slot.live = false;
    const t = "currentTime" in ctx ? ctx.currentTime : 0;
    n.frequency.setTargetAtTime(PARK_HZ, t, 0.05);
    n.Q.setTargetAtTime(8, t, 0.05);
  };

  const steer = (i: number, hz: number) => {
    const n = notches[i]!;
    const slot = slots[i]!;
    slot.hz = hz;
    slot.live = true;
    slot.miss = 0;
    const t = "currentTime" in ctx ? ctx.currentTime : 0;
    n.frequency.setTargetAtTime(hz, t, 0.06);
    n.Q.setTargetAtTime(notchQ(amount), t, 0.08);
  };

  const scan = () => {
    if (disposed || !analyser || !bins) return;
    if (amount < 0.03) {
      for (let i = 0; i < slots.length; i++) {
        if (slots[i]!.live) park(i);
      }
      return;
    }
    analyser.getFloatFrequencyData(bins as unknown as Float32Array<ArrayBuffer>);
    const sr = ctx.sampleRate;
    const fft = analyser.fftSize;
    const lo = Math.max(1, Math.floor((MIN_HZ * fft) / sr));
    const hi = Math.min(bins.length - 2, Math.ceil((MAX_HZ * fft) / sr));
    const slice: number[] = [];
    for (let i = lo; i <= hi; i++) slice.push(bins[i] ?? -120);
    if (slice.length < 8) return;
    const sorted = slice.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? -80;
    const needRise = 9 + (1 - amount) * 10;
    const floor = -58 + (1 - amount) * 14;
    const allowed = notchCount(amount);

    const peaks: { hz: number; mag: number }[] = [];
    for (let i = lo + 2; i <= hi - 2; i++) {
      const v = bins[i] ?? -120;
      if (v < floor) continue;
      if (v < median + needRise) continue;
      const l1 = bins[i - 1] ?? -120;
      const r1 = bins[i + 1] ?? -120;
      const l2 = bins[i - 2] ?? -120;
      const r2 = bins[i + 2] ?? -120;
      if (v <= l1 || v <= r1 || v <= l2 || v <= r2) continue;
      const hz = (i * sr) / fft;
      if (peaks.some((p) => Math.max(p.hz / hz, hz / p.hz) < MATCH_RATIO)) {
        continue;
      }
      peaks.push({ hz, mag: v });
    }
    peaks.sort((a, b) => b.mag - a.mag);
    const keep = peaks.slice(0, allowed);

    const matched = new Set<number>();
    for (const peak of keep) {
      let best = -1;
      let bestRatio = MATCH_RATIO;
      for (let i = 0; i < allowed; i++) {
        const s = slots[i]!;
        if (!s.live && s.pending === 0) continue;
        const ratio = Math.max(s.hz / peak.hz, peak.hz / s.hz);
        if (ratio < bestRatio) {
          bestRatio = ratio;
          best = i;
        }
      }
      if (best >= 0 && !matched.has(best)) {
        matched.add(best);
        const s = slots[best]!;
        s.pending += 1;
        s.miss = 0;
        if (s.live || s.pending >= 10) steer(best, peak.hz);
        continue;
      }
      let free = slots.findIndex(
        (s, i) => i < allowed && !s.live && s.pending === 0 && !matched.has(i),
      );
      if (free < 0) {
        free = slots.findIndex(
          (s, i) => i < allowed && !s.live && !matched.has(i),
        );
      }
      if (free >= 0) {
        matched.add(free);
        const s = slots[free]!;
        s.hz = peak.hz;
        s.pending += 1;
        s.miss = 0;
        if (s.pending >= 10) steer(free, peak.hz);
      }
    }

    for (let i = 0; i < slots.length; i++) {
      if (i >= allowed) {
        if (slots[i]!.live || slots[i]!.pending) park(i);
        continue;
      }
      if (matched.has(i)) continue;
      const s = slots[i]!;
      s.miss += 1;
      if (!s.live && s.miss > 6) {
        s.pending = 0;
        s.hz = PARK_HZ;
      }
      if (s.live && s.miss > 90) park(i);
    }
  };

  const tick = () => {
    if (disposed) return;
    scan();
    raf = requestAnimationFrame(tick);
  };

  if (!isOffline(ctx)) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -18;
    bins = new Float32Array(analyser.frequencyBinCount);
    input.connect(analyser);
    raf = requestAnimationFrame(tick);
  }

  const apply = (next: ObsInsert) => {
    amount = clamp(next.amount, 0, 1);
    const t = "currentTime" in ctx ? ctx.currentTime : 0;
    const q = notchQ(amount);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]!.live) notches[i]!.Q.setTargetAtTime(q, t, 0.08);
    }
  };
  apply(ins as ObsInsert);

  return {
    id: ins.id,
    kind: ins.kind,
    input,
    output,
    apply,
    dispose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const graph = [input, ...notches, analyser];
      for (const n of graph) {
        if (!n) continue;
        try {
          n.disconnect();
        } catch {
          /* noop */
        }
      }
    },
  };
}
