import {
  clampFilterGain,
  clampFilterHz,
  formantScaledHz,
  normalizeDelayTune,
  normalizeFormantTune,
  normalizeOffsetTune,
  normalizePitchTune,
  normalizeReverbTune,
  type SpectrumFilter,
  type SpectrumFilterKind,
} from "./spectrum-filters";

export type BandFxKind =
  | "band-reverb"
  | "band-formant"
  | "band-pitch"
  | "band-delay"
  | "band-offset";

export function isBandFxKind(kind: SpectrumFilterKind): kind is BandFxKind {
  return (
    kind === "band-reverb" ||
    kind === "band-formant" ||
    kind === "band-pitch" ||
    kind === "band-delay" ||
    kind === "band-offset"
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

function driveCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.max(0, amount) * 18;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = k < 0.02 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function tryLfo(ctx: BaseAudioContext) {
  try {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 0.65;
    osc.start(0);
    return osc;
  } catch {
    return null;
  }
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
    const delayL = ctx.createDelay(2);
    const delayR = ctx.createDelay(2);
    const shaperL = ctx.createWaveShaper();
    const shaperR = ctx.createWaveShaper();
    shaperL.curve = driveCurve(0);
    shaperR.curve = driveCurve(0);
    const lpL = ctx.createBiquadFilter();
    const lpR = ctx.createBiquadFilter();
    lpL.type = "lowpass";
    lpR.type = "lowpass";
    lpL.Q.value = 0.7;
    lpR.Q.value = 0.7;
    const selfL = ctx.createGain();
    const selfR = ctx.createGain();
    const crossL = ctx.createGain();
    const crossR = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    const wet = ctx.createGain();
    const lfo = tryLfo(ctx);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    hp.connect(delayL);
    hp.connect(delayR);
    delayL.connect(shaperL);
    delayR.connect(shaperR);
    shaperL.connect(lpL);
    shaperR.connect(lpR);
    lpL.connect(selfL);
    lpR.connect(selfR);
    lpL.connect(crossR);
    lpR.connect(crossL);
    selfL.connect(delayL);
    selfR.connect(delayR);
    crossR.connect(delayR);
    crossL.connect(delayL);
    delayL.connect(merge, 0, 0);
    delayR.connect(merge, 0, 1);
    merge.connect(wet);
    wet.connect(output);
    if (lfo) {
      lfo.connect(lfoGain);
      lfoGain.connect(delayL.delayTime);
      lfoGain.connect(delayR.delayTime);
    }
    nodes.push(
      hp,
      delayL,
      delayR,
      shaperL,
      shaperR,
      lpL,
      lpR,
      selfL,
      selfR,
      crossL,
      crossR,
      merge,
      wet,
      lfoGain,
    );
    if (lfo) nodes.push(lfo);
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
    let lastDrive = -1;
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
      const tL = d.timeMs / 1000;
      const tR = Math.min(1.95, tL + d.spreadMs / 1000);
      setParam(ctx, delayL.delayTime, tL);
      setParam(ctx, delayR.delayTime, tR);
      const fb = d.feedback * 0.92;
      setParam(ctx, selfL.gain, fb * (1 - d.pingpong));
      setParam(ctx, selfR.gain, fb * (1 - d.pingpong));
      setParam(ctx, crossL.gain, fb * d.pingpong);
      setParam(ctx, crossR.gain, fb * d.pingpong);
      setParam(ctx, hp.frequency, d.lowCutHz);
      setParam(ctx, lpL.frequency, d.highCutHz);
      setParam(ctx, lpR.frequency, d.highCutHz);
      setParam(ctx, wet.gain, mix * 0.9);
      if (lfo) setParam(ctx, lfo.frequency, d.modRate);
      setParam(ctx, lfoGain.gain, d.mod * 0.006);
      if (lastDrive !== d.drive) {
        shaperL.curve = driveCurve(d.drive);
        shaperR.curve = driveCurve(d.drive);
        lastDrive = d.drive;
      }
    };
  } else if (filter.kind === "band-offset") {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    const delay = ctx.createDelay(1.6);
    const dryG = ctx.createGain();
    const wetG = ctx.createGain();
    delay.connect(wetG);
    dryG.connect(output);
    wetG.connect(output);
    nodes.push(notch, delay, dryG, wetG);
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
      input.connect(dryG);
      input.connect(delay);
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
      try {
        notch.disconnect();
      } catch {
        /* noop */
      }
      input.connect(notch);
      notch.connect(output);
      input.connect(bp);
      bp.connect(dryG);
      bp.connect(delay);
    };
    let lastFull: boolean | null = null;
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, notch, f.hz, f.q);
      const o = normalizeOffsetTune(f.offset);
      const mix = Math.max(0, Math.min(1, clampFilterGain(f.gain) / 18));
      setParam(ctx, delay.delayTime, o.timeMs / 1000);
      setParam(ctx, dryG.gain, 1 - mix);
      setParam(ctx, wetG.gain, mix);
    };
  } else if (filter.kind === "band-formant") {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    const f1 = ctx.createBiquadFilter();
    f1.type = "peaking";
    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking";
    const f3 = ctx.createBiquadFilter();
    f3.type = "peaking";
    const dryG = ctx.createGain();
    const wetG = ctx.createGain();
    f1.connect(f2);
    f2.connect(f3);
    f3.connect(wetG);
    dryG.connect(output);
    wetG.connect(output);
    nodes.push(notch, f1, f2, f3, dryG, wetG);
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
      input.connect(dryG);
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
      try {
        notch.disconnect();
      } catch {
        /* noop */
      }
      input.connect(notch);
      notch.connect(output);
      input.connect(bp);
      bp.connect(dryG);
      bp.connect(f1);
    };
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, notch, f.hz, f.q);
      const ft = normalizeFormantTune(f.formant);
      const hz = formantScaledHz(ft);
      const g = clampFilterGain(f.gain);
      setParam(ctx, f1.frequency, hz.f1);
      setParam(ctx, f1.Q, ft.q1);
      setParam(ctx, f1.gain, g);
      setParam(ctx, f2.frequency, hz.f2);
      setParam(ctx, f2.Q, ft.q2);
      setParam(ctx, f2.gain, g * 0.7);
      setParam(ctx, f3.frequency, hz.f3);
      setParam(ctx, f3.Q, ft.q3);
      setParam(ctx, f3.gain, g * 0.45);
      setParam(ctx, dryG.gain, 1 - ft.mix);
      setParam(ctx, wetG.gain, ft.mix);
    };
  } else {
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    pitch = tryPitchNode(ctx);
    const dryG = ctx.createGain();
    const wetG = ctx.createGain();
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = "peaking";
    f2.type = "peaking";
    const fbDelay = ctx.createDelay(0.25);
    const fbG = ctx.createGain();
    fbG.gain.value = 0;
    dryG.connect(output);
    if (pitch) {
      pitch.connect(f1);
      f1.connect(f2);
      f2.connect(wetG);
      wetG.connect(fbDelay);
      fbDelay.connect(fbG);
      fbG.connect(pitch);
    } else {
      f1.connect(f2);
      f2.connect(wetG);
    }
    wetG.connect(output);
    if (pitch) nodes.push(pitch);
    nodes.push(notch, dryG, wetG, f1, f2, fbDelay, fbG);
    let lastFull: boolean | null = null;
    const hookPitch = (from: AudioNode) => {
      if (pitch) {
        from.connect(pitch);
      } else {
        from.connect(f1);
      }
    };
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
        pitch.connect(f1);
        fbG.connect(pitch);
      }
      input.connect(dryG);
      hookPitch(input);
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
        pitch.connect(f1);
        fbG.connect(pitch);
      }
      input.connect(notch);
      notch.connect(output);
      input.connect(bp);
      bp.connect(dryG);
      hookPitch(bp);
    };
    applyFn = (f) => {
      const isFull = !!f.fullBand;
      if (lastFull !== isFull) {
        if (isFull) full();
        else band();
        lastFull = isFull;
      }
      if (!isFull) tuneSplit(ctx, bp, notch, f.hz, f.q);
      const p = normalizePitchTune(f.pitch);
      const semi = Math.max(-12, Math.min(12, f.gain)) + p.cents / 100;
      const mix = p.mix;
      setParam(ctx, dryG.gain, 1 - mix);
      setParam(ctx, wetG.gain, mix);
      setParam(ctx, fbG.gain, p.feedback * 0.72);
      setParam(ctx, fbDelay.delayTime, p.delayMs / 1000);
      const form = p.formant - semi * p.preserve;
      const scale = Math.pow(2, form / 12);
      const amt = Math.min(10, Math.abs(form) * 0.55 + p.preserve * 3.2);
      setParam(ctx, f1.frequency, clampFilterHz(700 * scale));
      setParam(ctx, f1.Q, 1.15);
      setParam(ctx, f1.gain, amt);
      setParam(ctx, f2.frequency, clampFilterHz(1200 * scale));
      setParam(ctx, f2.Q, 0.95);
      setParam(ctx, f2.gain, amt * 0.65);
      if (pitch) {
        pitch.port.postMessage({
          type: "rate",
          value: Math.pow(2, semi / 12),
        });
        pitch.port.postMessage({ type: "grain", value: p.grain });
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
