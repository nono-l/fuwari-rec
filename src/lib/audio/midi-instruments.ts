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
  { id: "piano", label: "ピアノ", hint: "短い減衰", gm: 0 },
  { id: "epiano", label: "エレピ", hint: "ベル寄りの鍵盤", gm: 4 },
  { id: "organ", label: "オルガン", hint: "持続する倍音", gm: 16 },
  { id: "strings", label: "ストリングス", hint: "ゆっくり立ち上がる", gm: 48 },
  { id: "choir", label: "コーラス", hint: "厚めの声", gm: 52 },
  { id: "flute", label: "フルート", hint: "細い息", gm: 73 },
  { id: "clarinet", label: "クラリネット", hint: "少しこもった管", gm: 71 },
  { id: "sax", label: "サックス", hint: "鼻にかかるリード", gm: 66 },
  { id: "guitar", label: "ギター", hint: "爪弾き", gm: 24 },
  { id: "bass", label: "ベース", hint: "低い芯", gm: 33 },
  { id: "lead", label: "シンセリード", hint: "目立つ鋸波", gm: 80 },
  { id: "bells", label: "ベル", hint: "金属の残響", gm: 14 },
  { id: "pad", label: "パッド", hint: "長い空間", gm: 89 },
  { id: "square", label: "チップチューン", hint: "四角波", gm: 80 },
  { id: "pluck", label: "プラック", hint: "短いシンセ爪弾き", gm: 5 },
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

type OscType = OscillatorType;

type VoicePatch = {
  oscs: { type: OscType; ratio: number; detune: number; mix: number }[];
  filterType: BiquadFilterType;
  cutoff: (midi: number) => number;
  q: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  peak: number;
};

const PATCHES: Record<MidiInstrumentId, VoicePatch> = {
  piano: {
    oscs: [
      { type: "triangle", ratio: 1, detune: 0, mix: 1 },
      { type: "sine", ratio: 2, detune: 3, mix: 0.22 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 1400 + m * 28,
    q: 0.7,
    attack: 0.008,
    decay: 0.28,
    sustain: 0.18,
    release: 0.18,
    peak: 0.15,
  },
  epiano: {
    oscs: [
      { type: "sine", ratio: 1, detune: 0, mix: 1 },
      { type: "sine", ratio: 4.02, detune: 0, mix: 0.18 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 2200 + m * 18,
    q: 0.9,
    attack: 0.006,
    decay: 0.4,
    sustain: 0.22,
    release: 0.22,
    peak: 0.14,
  },
  organ: {
    oscs: [
      { type: "sine", ratio: 1, detune: 0, mix: 0.7 },
      { type: "sine", ratio: 2, detune: 0, mix: 0.35 },
      { type: "sine", ratio: 3, detune: 0, mix: 0.18 },
      { type: "square", ratio: 1, detune: 0, mix: 0.06 },
    ],
    filterType: "lowpass",
    cutoff: () => 4200,
    q: 0.4,
    attack: 0.02,
    decay: 0.05,
    sustain: 0.85,
    release: 0.06,
    peak: 0.1,
  },
  strings: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: -8, mix: 0.55 },
      { type: "sawtooth", ratio: 1, detune: 9, mix: 0.55 },
      { type: "triangle", ratio: 1, detune: 0, mix: 0.25 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 900 + m * 16,
    q: 0.5,
    attack: 0.14,
    decay: 0.25,
    sustain: 0.7,
    release: 0.28,
    peak: 0.09,
  },
  choir: {
    oscs: [
      { type: "triangle", ratio: 1, detune: -11, mix: 0.5 },
      { type: "triangle", ratio: 1, detune: 12, mix: 0.5 },
      { type: "sine", ratio: 2, detune: 0, mix: 0.2 },
    ],
    filterType: "lowpass",
    cutoff: () => 1800,
    q: 0.4,
    attack: 0.16,
    decay: 0.2,
    sustain: 0.75,
    release: 0.3,
    peak: 0.1,
  },
  flute: {
    oscs: [
      { type: "sine", ratio: 1, detune: 0, mix: 1 },
      { type: "triangle", ratio: 2, detune: 4, mix: 0.12 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 1800 + m * 12,
    q: 0.3,
    attack: 0.06,
    decay: 0.1,
    sustain: 0.7,
    release: 0.1,
    peak: 0.11,
  },
  clarinet: {
    oscs: [
      { type: "square", ratio: 1, detune: 0, mix: 0.7 },
      { type: "sine", ratio: 3, detune: 0, mix: 0.18 },
    ],
    filterType: "lowpass",
    cutoff: () => 1400,
    q: 0.8,
    attack: 0.05,
    decay: 0.12,
    sustain: 0.72,
    release: 0.1,
    peak: 0.09,
  },
  sax: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: 0, mix: 0.7 },
      { type: "square", ratio: 1, detune: 5, mix: 0.2 },
    ],
    filterType: "bandpass",
    cutoff: (m) => 700 + m * 10,
    q: 1.4,
    attack: 0.04,
    decay: 0.14,
    sustain: 0.7,
    release: 0.12,
    peak: 0.1,
  },
  guitar: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: 0, mix: 0.55 },
      { type: "triangle", ratio: 1, detune: 0, mix: 0.45 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 2200 + m * 10,
    q: 1.1,
    attack: 0.004,
    decay: 0.22,
    sustain: 0.12,
    release: 0.16,
    peak: 0.13,
  },
  bass: {
    oscs: [
      { type: "sine", ratio: 1, detune: 0, mix: 1 },
      { type: "square", ratio: 1, detune: 0, mix: 0.18 },
    ],
    filterType: "lowpass",
    cutoff: () => 700,
    q: 0.7,
    attack: 0.01,
    decay: 0.16,
    sustain: 0.55,
    release: 0.1,
    peak: 0.16,
  },
  lead: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: -6, mix: 0.6 },
      { type: "sawtooth", ratio: 1, detune: 7, mix: 0.5 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 1800 + m * 22,
    q: 1.2,
    attack: 0.02,
    decay: 0.12,
    sustain: 0.65,
    release: 0.1,
    peak: 0.1,
  },
  bells: {
    oscs: [
      { type: "sine", ratio: 1, detune: 0, mix: 0.7 },
      { type: "sine", ratio: 2.76, detune: 0, mix: 0.28 },
      { type: "sine", ratio: 5.4, detune: 0, mix: 0.1 },
    ],
    filterType: "lowpass",
    cutoff: () => 5000,
    q: 0.3,
    attack: 0.004,
    decay: 0.7,
    sustain: 0.08,
    release: 0.45,
    peak: 0.12,
  },
  pad: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: -14, mix: 0.4 },
      { type: "sawtooth", ratio: 1, detune: 15, mix: 0.4 },
      { type: "triangle", ratio: 0.5, detune: 0, mix: 0.3 },
    ],
    filterType: "lowpass",
    cutoff: () => 1100,
    q: 0.4,
    attack: 0.28,
    decay: 0.4,
    sustain: 0.75,
    release: 0.45,
    peak: 0.08,
  },
  square: {
    oscs: [
      { type: "square", ratio: 1, detune: 0, mix: 0.85 },
      { type: "square", ratio: 2, detune: 0, mix: 0.15 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 2400 + m * 15,
    q: 0.3,
    attack: 0.006,
    decay: 0.08,
    sustain: 0.7,
    release: 0.06,
    peak: 0.09,
  },
  pluck: {
    oscs: [
      { type: "sawtooth", ratio: 1, detune: 0, mix: 0.7 },
      { type: "triangle", ratio: 2, detune: 0, mix: 0.2 },
    ],
    filterType: "lowpass",
    cutoff: (m) => 2600 + m * 8,
    q: 1.6,
    attack: 0.003,
    decay: 0.16,
    sustain: 0.05,
    release: 0.12,
    peak: 0.13,
  },
};

export type LiveVoice = {
  stop: (when?: number) => void;
};

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
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
  const patch = PATCHES[opts.instrument ?? "piano"] ?? PATCHES.piano;
  const freq = midiToHz(opts.midi);
  const vel = Math.max(0.15, Math.min(1, opts.velocity));
  const peak = patch.peak * vel;
  const t0 = opts.t0;
  const dur = Math.max(0.04, opts.duration);
  const atk = patch.attack;
  const dec = patch.decay;
  const rel = patch.release;
  const sus = peak * patch.sustain;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
  amp.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, sus),
    t0 + atk + dec,
  );
  const releaseAt = t0 + dur;
  amp.gain.setValueAtTime(Math.max(0.0002, sus), releaseAt);
  amp.gain.exponentialRampToValueAtTime(0.0001, releaseAt + rel);

  const filt = ctx.createBiquadFilter();
  filt.type = patch.filterType;
  filt.frequency.setValueAtTime(patch.cutoff(opts.midi), t0);
  filt.Q.value = patch.q;
  // Pluck / guitar: close the filter over the note
  if (opts.instrument === "guitar" || opts.instrument === "pluck") {
    filt.frequency.exponentialRampToValueAtTime(
      Math.max(180, patch.cutoff(opts.midi) * 0.25),
      t0 + Math.min(0.35, dur + rel),
    );
  }

  amp.connect(filt);
  filt.connect(dest);

  const oscs: OscillatorNode[] = [];
  for (const o of patch.oscs) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = freq * o.ratio;
    osc.detune.value = o.detune;
    const mix = ctx.createGain();
    mix.gain.value = o.mix;
    osc.connect(mix);
    mix.connect(amp);
    osc.start(t0);
    osc.stop(releaseAt + rel + 0.05);
    oscs.push(osc);
  }

  return {
    stop: (when) => {
      const t = when ?? ctx.currentTime;
      try {
        amp.gain.cancelScheduledValues(t);
        amp.gain.setTargetAtTime(0.0001, t, 0.04);
      } catch {
        /* noop */
      }
      for (const osc of oscs) {
        try {
          osc.stop(t + 0.12);
        } catch {
          /* noop */
        }
      }
    },
  };
}
