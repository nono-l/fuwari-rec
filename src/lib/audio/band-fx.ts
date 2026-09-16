import {
  clampFilterGain,
  clampFilterHz,
  normalizeDelayTune,
  normalizeReverbTune,
  type SpectrumFilter,
  type SpectrumFilterKind,
} from "./spectrum-filters";

export type BandFxKind =
  | "band-reverb"
  | "band-formant"
  | "band-pitch"
  | "band-delay";

export function isBandFxKind(kind: SpectrumFilterKind): kind is BandFxKind {
  return (
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay"
  );
}

function makeReverbImpulse(
  ctx: BaseAudioContext,
  decay: number,
  size: number,
) {
  const rate = ctx.sampleRate;
  const duration = 0.38 + decay * (0.55 + size * 0.72);
  const length = Math.max(1, Math.floor(rate * duration));
  const decayPow = 3.35 - size * 1.95;
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayPow);
    }
  }
  return buf;
}

function setParam(ctx: BaseAudioContext, param: AudioParam, value: number) {
  const t = ctx.currentTime;
  try {
    param.setTargetAtTime(value, t, 0.02);
  } catch {
    param.value = value;
  }
}

function tryPitchNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  if (typeof AudioWorkletNode === "undefined") return null;
  try {
    return new AudioWorkletNode(ctx, "pitch-shift", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    return null;
  }
}

function tuneSplit(
  ctx: BaseAudioContext,
  bp: BiquadFilterNode,
  notch: BiquadFilterNode | null,
  hz: number,
  q: number,
) {
  const f = clampFilterHz(hz);
  const qq = Math.max(0.35, Math.min(18, q));
  setParam(ctx, bp.frequency, f);
  setParam(ctx, bp.Q, qq);
  if (notch) {
    setParam(ctx, notch.frequency, f);
    setParam(ctx, notch.Q, qq);
  }
}

export type BandFxHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (filter: SpectrumFilter) => void;
  dispose: () => void;
};

/**
 * Frequency-band FX: the selected band is sent through reverb / formant EQ /
 * a simple grain pitch shifter, then mixed. Complementary notch keeps the
 * rest of the spectrum (formant + pitch). Reverb is a send on top of dry.
 */
export function createBandFxHandle(
  ctx: BaseAudioContext,
  filter: SpectrumFilter,
): BandFxHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.gain.value = 1;
  output.gain.value = 1;
  const nodes: AudioNode[] = [input, output];

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  nodes.push(bp);

  let applyFn: (f: SpectrumFilter) => void = () => {};
  let pitch: AudioWorkletNode | null = null;

  if (filter.kind === "band-reverb") {
    input.connect(output);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 0.7;
    const delay = ctx.createDelay(0.12);
    const conv = ctx.createConvolver();
    const highCut = ctx.createBiquadFilter();
    highCut.type = "lowpass";
    highCut.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const keepL = ctx.createGain();
    const keepR = ctx.createGain();
    const crossL = ctx.createGain();
    const crossR = ctx.createGain();
    const wet = ctx.createGain();
    hp.connect(delay);
    delay.connect(conv);
    conv.connect(highCut);
    highCut.connect(lp);
    lp.connect(split);
    split.connect(keepL, 0);
    split.connect(crossR, 0);
    split.connect(keepR, 1);
    split.connect(crossL, 1);
    keepL.connect(merge, 0, 0);
    crossL.connect(merge, 0, 0);
    keepR.connect(merge, 0, 1);
    crossR.connect(merge, 0, 1);
    merge.connect(wet);
    wet.connect(output);
    nodes.push(hp, delay, conv, highCut, lp, split, merge, keepL, keepR, crossL, crossR, wet);
    const full = () => {
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      try {
        input.disconnect(hp);
      } catch {
        /* noop */
      }
      try {
        input.disconnect(bp);
      } catch {
        /* noop */
      }
      input.connect(hp);
    };
    const band = () => {
      try {
        input.disconnect(hp);
      } catch {
        /* noop */
      }
      try {
        input.disconnect(bp);
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      input.connect(bp);
      bp.connect(hp);
    };
    let lastFull: boolean | null = null;
    let lastDecay = -1;
    let lastSize = -1;
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, null, f.hz, f.q);
      const rv = normalizeReverbTune(f.reverb);
      if (lastDecay !== rv.decay || lastSize !== rv.size) {
        conv.buffer = makeReverbImpulse(ctx, rv.decay, rv.size);
        lastDecay = rv.decay;
        lastSize = rv.size;
      }
      const mix = Math.max(0, Math.min(1, clampFilterGain(f.gain) / 18));
      setParam(ctx, wet.gain, mix * 0.85);
      setParam(ctx, delay.delayTime, rv.predelayMs / 1000);
      setParam(ctx, hp.frequency, rv.lowCutHz);
      setParam(ctx, highCut.frequency, rv.highCutHz);
      const brightHz = 1800 * Math.pow(14000 / 1800, rv.brightness);
      setParam(ctx, lp.frequency, brightHz);
      const keep = 0.5 + 0.5 * rv.width;
      const cross = 0.5 - 0.5 * rv.width;
      setParam(ctx, keepL.gain, keep);
      setParam(ctx, keepR.gain, keep);
      setParam(ctx, crossL.gain, cross);
      setParam(ctx, crossR.gain, cross);
    };
  } else if (filter.kind === "band-delay") {
    input.connect(output);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 0.7;
    const delayL = ctx.createDelay(1.5);
    const delayR = ctx.createDelay(1.5);
    const fb = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    const merge = ctx.createChannelMerger(2);
    const toL = ctx.createGain();
    const toR = ctx.createGain();
    const spread = ctx.createGain();
    const wet = ctx.createGain();
    hp.connect(delayL);
    delayL.connect(fb);
    fb.connect(lp);
    lp.connect(delayL);
    delayL.connect(delayR);
    delayL.connect(toL);
    delayL.connect(spread);
    delayR.connect(toR);
    toL.connect(merge, 0, 0);
    spread.connect(merge, 0, 1);
    toR.connect(merge, 0, 1);
    merge.connect(wet);
    wet.connect(output);
    nodes.push(hp, delayL, delayR, fb, lp, merge, toL, toR, spread, wet);
    const full = () => {
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      try {
        input.disconnect(hp);
      } catch {
        /* noop */
      }
      try {
        input.disconnect(bp);
      } catch {
        /* noop */
      }
      input.connect(hp);
    };
    const band = () => {
      try {
        input.disconnect(hp);
      } catch {
        /* noop */
      }
      try {
        input.disconnect(bp);
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      input.connect(bp);
      bp.connect(hp);
    };
    let lastFull: boolean | null = null;
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, null, f.hz, f.q);
      const d = normalizeDelayTune(f.delay);
      const mix = Math.max(0, Math.min(1, clampFilterGain(f.gain) / 18));
      const t = d.timeMs / 1000;
      setParam(ctx, delayL.delayTime, t);
      setParam(ctx, delayR.delayTime, t);
      setParam(ctx, fb.gain, d.feedback * 0.92);
      setParam(ctx, hp.frequency, d.lowCutHz);
      setParam(ctx, lp.frequency, d.highCutHz);
      setParam(ctx, wet.gain, mix * 0.9);
      setParam(ctx, toL.gain, 1);
      setParam(ctx, spread.gain, 1 - d.pingpong);
      setParam(ctx, toR.gain, d.pingpong);
    };
  } else if (filter.kind === "band-formant") {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    const f1 = ctx.createBiquadFilter();
    f1.type = "peaking";
    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking";
    const wet = ctx.createGain();
    wet.gain.value = 1;
    bp.connect(f1);
    f1.connect(f2);
    f2.connect(output);
    nodes.push(notch, f1, f2, wet);
    let lastFull: boolean | null = null;
    const full = () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        notch.disconnect();
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      input.connect(f1);
    };
    const band = () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      input.connect(notch);
      notch.connect(output);
      input.connect(bp);
      bp.connect(f1);
    };
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      const hz = clampFilterHz(f.hz);
      const g = clampFilterGain(f.gain);
      const q = Math.max(0.5, Math.min(8, f.q));
      if (!isFull) tuneSplit(ctx, bp, notch, f.hz, f.q);
      setParam(ctx, f1.frequency, isFull ? 700 : hz);
      setParam(ctx, f1.Q, isFull ? 1.2 : q);
      setParam(ctx, f1.gain, g);
      setParam(ctx, f2.frequency, isFull ? 1200 : clampFilterHz(hz * 2.2));
      setParam(ctx, f2.Q, isFull ? 1 : Math.max(0.5, q * 0.85));
      setParam(ctx, f2.gain, g * 0.6);
    };
  } else {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    pitch = tryPitchNode(ctx);
    if (pitch) nodes.push(pitch);
    nodes.push(notch);
    let lastFull: boolean | null = null;
    const full = () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        notch.disconnect();
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      if (pitch) {
        try {
          pitch.disconnect();
        } catch {
          /* noop */
        }
        input.connect(pitch);
        pitch.connect(output);
      } else {
        input.connect(output);
      }
    };
    const band = () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        bp.disconnect();
      } catch {
        /* noop */
      }
      if (pitch) {
        try {
          pitch.disconnect();
        } catch {
          /* noop */
        }
      }
      input.connect(notch);
      notch.connect(output);
      input.connect(bp);
      if (pitch) {
        bp.connect(pitch);
        pitch.connect(output);
      } else {
        bp.connect(output);
      }
    };
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, notch, f.hz, f.q);
      const semi = Math.max(-12, Math.min(12, f.gain));
      if (pitch) {
        pitch.port.postMessage({
          type: "rate",
          value: Math.pow(2, semi / 12),
        });
      }
    };
  }

  applyFn(filter);

  return {
    id: filter.id,
    input,
    output,
    apply: (next) => {
      if (next.kind !== filter.kind) return;
      applyFn(next);
    },
    dispose: () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* noop */
        }
      }
    },
  };
}
