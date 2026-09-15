import {
  clampFilterGain,
  clampFilterHz,
  type SpectrumFilter,
  type SpectrumFilterKind,
} from "./spectrum-filters";

export type BandFxKind = "band-reverb" | "band-formant" | "band-pitch";

export function isBandFxKind(kind: SpectrumFilterKind): kind is BandFxKind {
  return kind === "band-reverb" || kind === "band-formant" || kind === "band-pitch";
}

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();

function impulseFor(ctx: BaseAudioContext) {
  let buf = impulses.get(ctx);
  if (buf) return buf;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 1.05);
  buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.35);
    }
  }
  impulses.set(ctx, buf);
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
    input.connect(bp);
    const conv = ctx.createConvolver();
    conv.buffer = impulseFor(ctx);
    const wet = ctx.createGain();
    bp.connect(conv);
    conv.connect(wet);
    wet.connect(output);
    nodes.push(conv, wet);
    applyFn = (f) => {
      tuneSplit(ctx, bp, null, f.hz, f.q);
      const mix = Math.max(0, Math.min(1, clampFilterGain(f.gain) / 18));
      setParam(ctx, wet.gain, mix * 0.85);
    };
  } else if (filter.kind === "band-formant") {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    const f1 = ctx.createBiquadFilter();
    f1.type = "peaking";
    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking";
    input.connect(notch);
    notch.connect(output);
    input.connect(bp);
    bp.connect(f1);
    f1.connect(f2);
    f2.connect(output);
    nodes.push(notch, f1, f2);
    applyFn = (f) => {
      tuneSplit(ctx, bp, notch, f.hz, f.q);
      const hz = clampFilterHz(f.hz);
      const g = clampFilterGain(f.gain);
      const q = Math.max(0.5, Math.min(8, f.q));
      setParam(ctx, f1.frequency, hz);
      setParam(ctx, f1.Q, q);
      setParam(ctx, f1.gain, g);
      setParam(ctx, f2.frequency, clampFilterHz(hz * 2.2));
      setParam(ctx, f2.Q, Math.max(0.5, q * 0.85));
      setParam(ctx, f2.gain, g * 0.6);
    };
  } else {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    input.connect(notch);
    notch.connect(output);
    input.connect(bp);
    pitch = tryPitchNode(ctx);
    if (pitch) {
      bp.connect(pitch);
      pitch.connect(output);
      nodes.push(pitch);
    } else {
      bp.connect(output);
    }
    nodes.push(notch);
    applyFn = (f) => {
      tuneSplit(ctx, bp, notch, f.hz, f.q);
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
