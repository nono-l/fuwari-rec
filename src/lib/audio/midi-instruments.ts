export type MidiInstrumentId =
  | "piano"
  | "epiano"
  | "organ"
  | "strings"
  | "choir"
  | "flute"
  | "clarinet"
  | "sax"
  | "guitar"
  | "bass"
  | "lead"
  | "bells"
  | "pad"
  | "square"
  | "pluck";

export type MidiInstrument = {
  id: MidiInstrumentId;
  label: string;
  hint: string;
  /** General MIDI program (0–127) written into exported .mid */
  gm: number;
};

export const MIDI_INSTRUMENTS: MidiInstrument[] = [
  { id: "piano", label: "ピアノ", hint: "ハンマー＋倍音減衰", gm: 0 },
  { id: "epiano", label: "エレピ", hint: "タインのFM", gm: 4 },
  { id: "organ", label: "オルガン", hint: "ドローバー", gm: 16 },
  { id: "strings", label: "ストリングス", hint: "アンサンブル", gm: 48 },
  { id: "choir", label: "コーラス", hint: "フォルマント", gm: 52 },
  { id: "flute", label: "フルート", hint: "息＋ビブラート", gm: 73 },
  { id: "clarinet", label: "クラリネット", hint: "奇数倍音", gm: 71 },
  { id: "sax", label: "サックス", hint: "リード＋フォルマント", gm: 66 },
  { id: "guitar", label: "ギター", hint: "弦の減衰", gm: 24 },
  { id: "bass", label: "ベース", hint: "太い低音", gm: 33 },
  { id: "lead", label: "シンセリード", hint: "ユニゾン鋸波", gm: 80 },
  { id: "bells", label: "ベル", hint: "非整数倍音", gm: 14 },
  { id: "pad", label: "パッド", hint: "厚い空間", gm: 89 },
  { id: "square", label: "チップチューン", hint: "パルス", gm: 80 },
  { id: "pluck", label: "プラック", hint: "はじき", gm: 5 },
];

export const DEFAULT_MIDI_INSTRUMENT: MidiInstrumentId = "piano";

export function isMidiInstrumentId(v: string): v is MidiInstrumentId {
  return MIDI_INSTRUMENTS.some((i) => i.id === v);
}

export function instrumentLabel(id: MidiInstrumentId | undefined) {
  return MIDI_INSTRUMENTS.find((i) => i.id === id)?.label ?? "ピアノ";
}

export function instrumentGm(id: MidiInstrumentId | undefined) {
  return MIDI_INSTRUMENTS.find((i) => i.id === (id ?? "piano"))?.gm ?? 0;
}

export type LiveVoice = {
  stop: (when?: number) => void;
};

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function envExp(
  g: AudioParam,
  t0: number,
  peak: number,
  atk: number,
  dec: number,
  sus: number,
  relAt: number,
  rel: number,
) {
  const p = Math.max(0.0002, peak);
  const s = Math.max(0.0002, sus);
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(p, t0 + Math.max(0.003, atk));
  g.exponentialRampToValueAtTime(s, t0 + Math.max(0.003, atk) + Math.max(0.01, dec));
  g.setValueAtTime(s, relAt);
  g.exponentialRampToValueAtTime(0.0001, relAt + Math.max(0.02, rel));
}

function noiseBurst(
  ctx: BaseAudioContext,
  seconds: number,
  color: "white" | "pink",
): AudioBuffer {
  const n = Math.max(32, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "white") {
      d[i] = w;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
  }
  return buf;
}

function karplusBuffer(
  ctx: BaseAudioContext,
  freq: number,
  seconds: number,
  brightness: number,
  decay: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const period = Math.max(2, Math.round(sr / Math.max(40, freq)));
  const len = Math.max(period + 8, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < period; i++) {
    d[i] = (Math.random() * 2 - 1) * brightness;
  }
  // one-pole average in the loop — classic plucked string
  const damp = Math.min(0.998, Math.max(0.9, decay));
  for (let i = period; i < len; i++) {
    const a = d[i - period] ?? 0;
    const b = d[i - period + 1] ?? a;
    d[i] = ((a + b) * 0.5) * damp;
  }
  return buf;
}

function addSine(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  t0: number,
  stopAt: number,
  mix: number,
  detune = 0,
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = Math.max(20, freq);
  osc.detune.value = detune;
  const g = ctx.createGain();
  g.gain.value = mix;
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(stopAt);
  return osc;
}

/** Schedule a note into dest. Live: pass a long duration and call stop() on release. */
export function startMidiVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  opts: {
    midi: number;
    velocity: number;
    t0: number;
    duration: number;
    instrument?: MidiInstrumentId;
  },
): LiveVoice {
  const id = opts.instrument ?? "piano";
  const freq = midiToHz(opts.midi);
  const vel = Math.max(0.12, Math.min(1, opts.velocity));
  const t0 = opts.t0;
  const dur = Math.max(0.05, opts.duration);
  const sources: AudioScheduledSourceNode[] = [];
  const amp = ctx.createGain();
  amp.gain.value = 1;

  const stopAtDefault = t0 + dur + 1.4;
  let releaseAt = t0 + dur;
  let releaseSec = 0.12;

  const stop = (when?: number) => {
    const t = when ?? ctx.currentTime;
    try {
      amp.gain.cancelScheduledValues(t);
      amp.gain.setTargetAtTime(0.0001, t, 0.045);
    } catch {
      /* noop */
    }
    for (const s of sources) {
      try {
        s.stop(t + 0.18);
      } catch {
        /* already */
      }
    }
  };

  const out = (node: AudioNode) => {
    node.connect(amp);
  };

  if (id === "piano") {
    releaseSec = 0.28;
    const body = ctx.createGain();
    out(body);
    const B = 0.00032;
    const partials = [
      [1, 1],
      [2, 0.48],
      [3, 0.24],
      [4, 0.14],
      [5, 0.09],
      [6, 0.055],
      [7, 0.032],
      [8, 0.02],
    ] as const;
    const peak = 0.13 * vel;
    for (const [n, ampN] of partials) {
      const g = ctx.createGain();
      const decay = 1.7 / Math.pow(n, 0.72);
      envExp(
        g.gain,
        t0,
        peak * ampN,
        0.004,
        decay * 0.35,
        peak * ampN * 0.08,
        releaseAt,
        releaseSec + 0.08 * n,
      );
      const stretch = n * freq * Math.sqrt(1 + B * n * n);
      sources.push(addSine(ctx, g, stretch, t0, stopAtDefault, 1));
      g.connect(body);
    }
    const hammer = ctx.createBufferSource();
    hammer.buffer = noiseBurst(ctx, 0.012, "white");
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800 + opts.midi * 18;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.07 * vel, t0 + 0.004);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    hammer.connect(hp);
    hp.connect(hg);
    hg.connect(body);
    hammer.start(t0);
    hammer.stop(t0 + 0.05);
    sources.push(hammer);
    amp.connect(dest);
    return { stop };
  }

  if (id === "epiano") {
    releaseSec = 0.32;
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 14;
    const idx = ctx.createGain();
    const indexPeak = freq * (2.2 + vel * 3.4);
    idx.gain.setValueAtTime(0.0001, t0);
    idx.gain.exponentialRampToValueAtTime(indexPeak, t0 + 0.005);
    idx.gain.exponentialRampToValueAtTime(indexPeak * 0.12, t0 + 0.42);
    idx.gain.setValueAtTime(indexPeak * 0.12, releaseAt);
    idx.gain.exponentialRampToValueAtTime(0.0001, releaseAt + releaseSec);
    mod.connect(idx);
    idx.connect(car.frequency);
    const tone = ctx.createGain();
    envExp(tone.gain, t0, 0.16 * vel, 0.004, 0.38, 0.035 * vel, releaseAt, releaseSec);
    car.connect(tone);
    // tine click
    const tine = ctx.createOscillator();
    tine.type = "sine";
    tine.frequency.value = freq * 7.2;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.04 * vel, t0);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    tine.connect(tg);
    tg.connect(tone);
    out(tone);
    car.start(t0);
    mod.start(t0);
    tine.start(t0);
    car.stop(stopAtDefault);
    mod.stop(stopAtDefault);
    tine.stop(t0 + 0.1);
    sources.push(car, mod, tine);
    amp.connect(dest);
    return { stop };
  }

  if (id === "organ") {
    releaseSec = 0.05;
    const mix = ctx.createGain();
    mix.gain.value = 1;
    // Hammond-ish drawbars 16' 8' 5⅓' 4' 2⅔' 2' 1⅗'
    const bars: [number, number][] = [
      [0.5, 0.55],
      [1, 0.85],
      [1.5, 0.32],
      [2, 0.45],
      [3, 0.22],
      [4, 0.16],
      [6, 0.08],
    ];
    const peak = 0.07 * vel;
    envExp(amp.gain, t0, 1, 0.008, 0.03, 0.92, releaseAt, releaseSec);
    for (const [ratio, w] of bars) {
      sources.push(addSine(ctx, mix, freq * ratio, t0, stopAtDefault, peak * w));
    }
    const click = ctx.createBufferSource();
    click.buffer = noiseBurst(ctx, 0.008, "white");
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.05 * vel, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);
    click.connect(cg);
    cg.connect(mix);
    click.start(t0);
    click.stop(t0 + 0.03);
    sources.push(click);
    out(mix);
    amp.connect(dest);
    return { stop };
  }

  if (id === "strings" || id === "pad") {
    const slow = id === "pad";
    releaseSec = slow ? 0.55 : 0.38;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    const open = slow ? 1400 : 2200 + opts.midi * 8;
    filt.frequency.setValueAtTime(400, t0);
    filt.frequency.exponentialRampToValueAtTime(open, t0 + (slow ? 0.45 : 0.22));
    filt.Q.value = 0.7;
    envExp(
      amp.gain,
      t0,
      1,
      slow ? 0.32 : 0.16,
      0.22,
      0.82,
      releaseAt,
      releaseSec,
    );
    const detunes = slow ? [-16, -6, 6, 17] : [-11, -4, 5, 12];
    const peak = (slow ? 0.045 : 0.055) * vel;
    for (const cents of detunes) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = peak;
      osc.connect(g);
      g.connect(filt);
      osc.start(t0);
      osc.stop(stopAtDefault);
      sources.push(osc);
    }
    out(filt);
    amp.connect(dest);
    return { stop };
  }

  if (id === "choir") {
    releaseSec = 0.4;
    envExp(amp.gain, t0, 1, 0.18, 0.2, 0.8, releaseAt, releaseSec);
    const body = ctx.createGain();
    body.gain.value = 0.07 * vel;
    const formants: [number, number][] = [
      [620, 1],
      [1220, 0.55],
      [2550, 0.22],
    ];
    for (const cents of [-10, 0, 11]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.start(t0);
      osc.stop(stopAtDefault);
      sources.push(osc);
      for (const [hz, w] of formants) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = hz;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.value = w;
        osc.connect(bp);
        bp.connect(g);
        g.connect(body);
      }
    }
    out(body);
    amp.connect(dest);
    return { stop };
  }

  if (id === "flute") {
    releaseSec = 0.12;
    envExp(amp.gain, t0, 1, 0.055, 0.1, 0.75, releaseAt, releaseSec);
    const mix = ctx.createGain();
    sources.push(addSine(ctx, mix, freq, t0, stopAtDefault, 0.16 * vel));
    sources.push(addSine(ctx, mix, freq * 2, t0, stopAtDefault, 0.025 * vel));
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(0, t0);
    lfoG.gain.linearRampToValueAtTime(9, t0 + 0.35);
    lfo.connect(lfoG);
    // apply to first sine via detune — reconnect through mix children is hard;
    // add a carrier we can detune
    const vib = ctx.createOscillator();
    vib.type = "sine";
    vib.frequency.value = freq;
    lfoG.connect(vib.detune);
    const vg = ctx.createGain();
    vg.gain.value = 0.12 * vel;
    vib.connect(vg);
    vg.connect(mix);
    vib.start(t0);
    lfo.start(t0);
    vib.stop(stopAtDefault);
    lfo.stop(stopAtDefault);
    sources.push(vib, lfo);
    const breath = ctx.createBufferSource();
    breath.buffer = noiseBurst(ctx, Math.min(dur + 0.2, 2.5), "pink");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 2.2;
    bp.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.03 * vel, t0);
    bg.gain.exponentialRampToValueAtTime(0.008 * vel, t0 + 0.12);
    breath.connect(bp);
    bp.connect(bg);
    bg.connect(mix);
    breath.start(t0);
    breath.stop(stopAtDefault);
    sources.push(breath);
    out(mix);
    amp.connect(dest);
    return { stop };
  }

  if (id === "clarinet") {
    releaseSec = 0.12;
    envExp(amp.gain, t0, 1, 0.045, 0.12, 0.78, releaseAt, releaseSec);
    const mix = ctx.createGain();
    const odds: [number, number][] = [
      [1, 0.16],
      [3, 0.07],
      [5, 0.035],
      [7, 0.018],
      [9, 0.01],
    ];
    for (const [n, w] of odds) {
      sources.push(addSine(ctx, mix, freq * n, t0, stopAtDefault, w * vel));
    }
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    mix.connect(lp);
    out(lp);
    amp.connect(dest);
    return { stop };
  }

  if (id === "sax") {
    releaseSec = 0.14;
    envExp(amp.gain, t0, 1, 0.04, 0.14, 0.76, releaseAt, releaseSec);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 720 + opts.midi * 6;
    bp.Q.value = 2.2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2800;
    const g = ctx.createGain();
    g.gain.value = 0.12 * vel;
    osc.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t0);
    lg.gain.linearRampToValueAtTime(7, t0 + 0.28);
    lfo.connect(lg);
    lg.connect(osc.detune);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(stopAtDefault);
    lfo.stop(stopAtDefault);
    sources.push(osc, lfo);
    out(g);
    amp.connect(dest);
    return { stop };
  }

  if (id === "guitar" || id === "pluck") {
    releaseSec = id === "pluck" ? 0.08 : 0.16;
    const bright = (id === "pluck" ? 0.95 : 0.72) * (0.55 + vel * 0.45);
    const decay = id === "pluck" ? 0.972 : 0.988 - (opts.midi - 40) * 0.00025;
    const buf = karplusBuffer(ctx, freq, Math.min(dur + 1.2, 3.2), bright, decay);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200 + vel * 1800, t0);
    lp.frequency.exponentialRampToValueAtTime(420, t0 + (id === "pluck" ? 0.18 : 0.4));
    const g = ctx.createGain();
    envExp(g.gain, t0, 0.34 * vel, 0.002, 0.08, 0.12 * vel, releaseAt, releaseSec);
    src.connect(lp);
    lp.connect(g);
    src.start(t0);
    src.stop(stopAtDefault);
    sources.push(src);
    out(g);
    amp.connect(dest);
    return { stop };
  }

  if (id === "bass") {
    releaseSec = 0.12;
    envExp(amp.gain, t0, 1, 0.006, 0.14, 0.62, releaseAt, releaseSec);
    const mix = ctx.createGain();
    sources.push(addSine(ctx, mix, freq, t0, stopAtDefault, 0.22 * vel));
    sources.push(addSine(ctx, mix, freq * 2, t0, stopAtDefault, 0.05 * vel));
    const click = ctx.createOscillator();
    click.type = "triangle";
    click.frequency.value = freq * 3;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.08 * vel, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    click.connect(cg);
    cg.connect(mix);
    click.start(t0);
    click.stop(t0 + 0.08);
    sources.push(click);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    mix.connect(lp);
    out(lp);
    amp.connect(dest);
    return { stop };
  }

  if (id === "lead") {
    releaseSec = 0.1;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 1.6;
    const open = 900 + vel * 2800 + opts.midi * 12;
    filt.frequency.setValueAtTime(open, t0);
    filt.frequency.exponentialRampToValueAtTime(480, t0 + 0.22);
    envExp(amp.gain, t0, 1, 0.012, 0.1, 0.7, releaseAt, releaseSec);
    for (const cents of [-7, 0, 8]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = 0.07 * vel;
      osc.connect(g);
      g.connect(filt);
      osc.start(t0);
      osc.stop(stopAtDefault);
      sources.push(osc);
    }
    out(filt);
    amp.connect(dest);
    return { stop };
  }

  if (id === "bells") {
    releaseSec = 0.7;
    envExp(amp.gain, t0, 1, 0.003, 0.55, 0.06, releaseAt, releaseSec);
    const mix = ctx.createGain();
    const parts: [number, number][] = [
      [1, 0.14],
      [2.76, 0.07],
      [5.4, 0.035],
      [8.21, 0.016],
    ];
    for (const [r, w] of parts) {
      sources.push(addSine(ctx, mix, freq * r, t0, stopAtDefault, w * vel));
    }
    out(mix);
    amp.connect(dest);
    return { stop };
  }

  // square / chip
  releaseSec = 0.05;
  envExp(amp.gain, t0, 1, 0.004, 0.05, 0.72, releaseAt, releaseSec);
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = freq;
  const sub = ctx.createOscillator();
  sub.type = "square";
  sub.frequency.value = freq * 2;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200 + opts.midi * 20;
  const g1 = ctx.createGain();
  g1.gain.value = 0.1 * vel;
  const g2 = ctx.createGain();
  g2.gain.value = 0.025 * vel;
  osc.connect(g1);
  sub.connect(g2);
  g1.connect(lp);
  g2.connect(lp);
  osc.start(t0);
  sub.start(t0);
  osc.stop(stopAtDefault);
  sub.stop(stopAtDefault);
  sources.push(osc, sub);
  out(lp);
  amp.connect(dest);
  return { stop };
}
