import { Synthesizer, waitForReady } from "js-synthesizer";
import fluidsynthUrl from "js-synthesizer/externals/libfluidsynth-2.4.6.js?url";
import { instrumentGm, type MidiInstrumentId } from "@/lib/audio/midi-instruments";
import type { ParsedMidi } from "@/lib/audio/midi";

let wasmReady = false;
let wasmPromise: Promise<void> | null = null;

async function ensureWasm() {
  if (wasmReady) return;
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("SoundFont はブラウザでのみ使えます");
    }
    if (!(window as unknown as { Module?: unknown }).Module) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = fluidsynthUrl;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("FluidSynth WASM を読めませんでした"));
        document.head.appendChild(s);
      });
    }
    const mod = (window as unknown as { Module?: unknown }).Module;
    if (!mod) throw new Error("FluidSynth モジュールがありません");
    Synthesizer.initializeWithFluidSynthModule(mod);
    await waitForReady();
    wasmReady = true;
  })();
  try {
    await wasmPromise;
  } catch (e) {
    wasmPromise = null;
    throw e;
  }
}

export async function renderWithFluidSynth(
  sfont: ArrayBuffer,
  parsed: ParsedMidi,
  sampleRate: number,
  instrument: MidiInstrumentId,
): Promise<AudioBuffer> {
  await ensureWasm();

  const length = Math.max(1, Math.ceil(Math.min(parsed.duration, 600) * sampleRate));
  const notes = parsed.notes.slice(0, 8000);
  const gm = instrumentGm(instrument);

  const synth = new Synthesizer();
  synth.init(sampleRate, {
    initialGain: 0.45,
    polyphony: 128,
    midiBankSelect: "gm",
    chorusActive: false,
    reverbActive: false,
  });
  await synth.loadSFont(sfont.slice(0));

  const channels = new Set(notes.map((n) => Math.max(0, Math.min(15, n.channel || 0))));
  for (const ch of channels) {
    if (ch === 9) continue;
    synth.midiProgramChange(ch, gm);
  }

  type Ev = { at: number; on: boolean; ch: number; key: number; vel: number };
  const events: Ev[] = [];
  for (const n of notes) {
    if (n.start >= 600) continue;
    const ch = Math.max(0, Math.min(15, n.channel || 0));
    const key = Math.max(0, Math.min(127, Math.round(n.midi)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
    const start = Math.max(0, Math.floor(n.start * sampleRate));
    const end = Math.min(
      length,
      Math.floor((n.start + Math.min(n.duration, 8)) * sampleRate),
    );
    events.push({ at: start, on: true, ch, key, vel });
    events.push({ at: Math.max(start + 1, end), on: false, ch, key, vel: 0 });
  }
  events.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on));

  const block = 512;
  const left = new Float32Array(block);
  const right = new Float32Array(block);
  const outL = new Float32Array(length);
  const outR = new Float32Array(length);
  let ev = 0;
  let lastYield = performance.now();

  for (let pos = 0; pos < length; pos += block) {
    const until = Math.min(length, pos + block);
    while (ev < events.length && events[ev]!.at < until) {
      const e = events[ev++]!;
      if (e.on) synth.midiNoteOn(e.ch, e.key, e.vel);
      else synth.midiNoteOff(e.ch, e.key);
    }
    synth.render([left, right]);
    const n = until - pos;
    outL.set(left.subarray(0, n), pos);
    outR.set(right.subarray(0, n), pos);
    if (performance.now() - lastYield > 40) {
      lastYield = performance.now();
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  synth.close();
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const audio = ctx.createBuffer(2, length, sampleRate);
  audio.copyToChannel(outL, 0);
  audio.copyToChannel(outR, 1);
  return audio;
}
