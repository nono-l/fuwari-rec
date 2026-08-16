import {
  centsBetween,
  detectPitch,
  hzToMidi,
  midiToNoteName,
} from "./pitch";
import type { MidiNote, ParsedMidi } from "./midi";
import { instrumentGm, type MidiInstrumentId } from "./midi-instruments";

export type MelodyMidiResult = {
  notes: MidiNote[];
  parsed: ParsedMidi;
  bytes: Uint8Array;
  framesScanned: number;
};

export type RhythmGrid = 4 | 8 | 12 | 16;

export type RhythmOpts = {
  bpm: number;
  /** 4=四分, 8=八分, 16=十六分, 12=八分三連 */
  grid: RhythmGrid;
  /** 0 = 歌ったタイミングのまま, 1 = 完全にグリッドへ */
  strength: number;
  /** 0–1, delays off-beats (swing) */
  swing: number;
};

function monoFromBuffer(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const n = buffer.numberOfChannels;
  for (let ch = 0; ch < n; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i]! += (data[i] ?? 0) / n;
  }
  return out;
}

function writeVarLen(n: number, out: number[]) {
  let v = Math.max(0, Math.floor(n));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  out.push(...bytes);
}

function secondsToTick(sec: number, bpm: number, tpq: number) {
  return Math.max(0, Math.round(sec * (bpm / 60) * tpq));
}

/** Encode monophonic notes as SMF format 0. */
export function encodeMidiFile(
  notes: MidiNote[],
  opts?: { bpm?: number; name?: string; instrument?: MidiInstrumentId },
): Uint8Array {
  const bpm = opts?.bpm && opts.bpm > 0 ? opts.bpm : 120;
  const tpq = 480;
  const usPerQn = Math.round(60_000_000 / bpm);
  const track: number[] = [];

  track.push(0x00, 0xff, 0x51, 0x03, (usPerQn >> 16) & 0xff, (usPerQn >> 8) & 0xff, usPerQn & 0xff);

  const name = (opts?.name ?? "Fuwari melody").slice(0, 64);
  if (name) {
    const enc = new TextEncoder().encode(name);
    track.push(0x00, 0xff, 0x03, enc.length);
    for (const b of enc) track.push(b);
  }

  const gm = instrumentGm(opts?.instrument);
  track.push(0x00, 0xc0, gm & 0x7f);

  type Ev = { tick: number; status: number; note: number; vel: number };
  const evs: Ev[] = [];
  for (const n of notes) {
    const on = secondsToTick(n.start, bpm, tpq);
    const off = secondsToTick(n.start + n.duration, bpm, tpq);
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
    evs.push({ tick: on, status: 0x90, note: n.midi, vel });
    evs.push({ tick: Math.max(on + 1, off), status: 0x80, note: n.midi, vel: 0 });
  }
  evs.sort((a, b) => a.tick - b.tick || a.status - b.status);

  let last = 0;
  for (const e of evs) {
    writeVarLen(e.tick - last, track);
    last = e.tick;
    track.push(e.status, e.note & 0x7f, e.vel & 0x7f);
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = new Uint8Array(14);
  const hv = new DataView(header.buffer);
  header.set([0x4d, 0x54, 0x68, 0x64]);
  hv.setUint32(4, 6);
  hv.setUint16(8, 0);
  hv.setUint16(10, 1);
  hv.setUint16(12, tpq);

  const th = new Uint8Array(8 + track.length);
  const tv = new DataView(th.buffer);
  th.set([0x4d, 0x54, 0x72, 0x6b]);
  tv.setUint32(4, track.length);
  th.set(track, 8);

  const out = new Uint8Array(header.length + th.length);
  out.set(header, 0);
  out.set(th, header.length);
  return out;
}

function gridSec(bpm: number, grid: RhythmGrid) {
  const beat = 60 / Math.max(30, Math.min(240, bpm));
  if (grid === 4) return beat;
  if (grid === 8) return beat / 2;
  if (grid === 12) return beat / 3;
  return beat / 4;
}

function snapValue(sec: number, step: number) {
  if (step <= 1e-6) return sec;
  return Math.max(0, Math.round(sec / step) * step);
}

/**
 * Move note onsets/durations toward a grid. MIDI note numbers stay untouched.
 */
export function applyRhythmOnly(notes: MidiNote[], opts: RhythmOpts): MidiNote[] {
  const strength = Math.max(0, Math.min(1, opts.strength));
  const step = gridSec(opts.bpm, opts.grid);
  const swing = Math.max(0, Math.min(0.75, opts.swing));
  const swung = notes
    .map((n) => {
      let start = n.start + (snapValue(n.start, step) - n.start) * strength;
      const durSnap = Math.max(step, snapValue(n.duration, step));
      let duration = n.duration + (durSnap - n.duration) * strength;
      if (swing > 0 && opts.grid !== 12) {
        const idx = Math.round(start / step);
        if (idx % 2 === 1) start += step * swing * 0.5 * strength;
      }
      return { ...n, start, duration: Math.max(step * 0.5, duration) };
    })
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < swung.length - 1; i++) {
    const cur = swung[i]!;
    const next = swung[i + 1]!;
    const maxDur = next.start - cur.start - 0.005;
    if (maxDur <= 0.02) {
      cur.duration = Math.max(0.02, maxDur);
    } else if (cur.start + cur.duration > next.start) {
      cur.duration = maxDur;
    }
  }
  return swung;
}

export function notesToParsed(
  notes: MidiNote[],
  name: string,
): ParsedMidi {
  return {
    notes,
    duration: notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0) + 0.2,
    ticksPerQuarter: 480,
    name,
  };
}

/**
 * Convert a sung (or monophonic) AudioBuffer into MIDI notes.
 * Vibrato is held on the current note until it drifts ~40 cents.
 */
export async function melodyFromBuffer(
  buffer: AudioBuffer,
  opts?: {
    bpm?: number;
    name?: string;
    minHz?: number;
    maxHz?: number;
    onProgress?: (p: number) => void;
  },
): Promise<MelodyMidiResult> {
  const sampleRate = buffer.sampleRate;
  const mono = monoFromBuffer(buffer);
  const frameSize = 2048;
  const hop = 512;
  const minDur = 0.09;
  const centsTol = 40;
  const switchFrames = 3;

  const notes: MidiNote[] = [];
  let curMidi: number | null = null;
  let curStart = 0;
  let curVelAcc = 0;
  let curVelN = 0;
  let pendingMidi: number | null = null;
  let pendingCount = 0;
  let framesScanned = 0;
  const lastT = Math.max(0, mono.length - frameSize);
  let lastYield = performance.now();

  const close = (endSec: number) => {
    if (curMidi == null) return;
    const dur = endSec - curStart;
    if (dur >= minDur) {
      notes.push({
        midi: curMidi,
        start: curStart,
        duration: dur,
        velocity: Math.max(0.25, Math.min(0.95, curVelN ? curVelAcc / curVelN : 0.6)),
        channel: 0,
      });
    }
    curMidi = null;
    curVelAcc = 0;
    curVelN = 0;
    pendingMidi = null;
    pendingCount = 0;
  };

  for (let i = 0; i + frameSize < mono.length; i += hop) {
    framesScanned++;
    const t = i / sampleRate;
    const frame = new Float32Array(frameSize);
    frame.set(mono.subarray(i, i + frameSize));
    const detected = detectPitch(frame, sampleRate, {
      minHz: opts?.minHz ?? 70,
      maxHz: opts?.maxHz ?? 1000,
    });
    const voiced =
      detected &&
      detected.confidence >= 0.58 &&
      detected.rms >= 0.012;

    if (!voiced) {
      close(t);
    } else {
      const midi = Math.round(hzToMidi(detected.hz));
      const clamped = Math.max(36, Math.min(84, midi));
      const vel = Math.max(0.25, Math.min(0.95, detected.rms * 4.2));
      if (curMidi == null) {
        curMidi = clamped;
        curStart = t;
        curVelAcc = vel;
        curVelN = 1;
      } else if (
        clamped === curMidi ||
        Math.abs(centsBetween(detected.hz, 440 * 2 ** ((curMidi - 69) / 12))) <=
          centsTol
      ) {
        curVelAcc += vel;
        curVelN += 1;
        pendingMidi = null;
        pendingCount = 0;
      } else if (pendingMidi === clamped) {
        pendingCount += 1;
        if (pendingCount >= switchFrames) {
          close(t);
          curMidi = clamped;
          curStart = t;
          curVelAcc = vel;
          curVelN = 1;
        }
      } else {
        pendingMidi = clamped;
        pendingCount = 1;
      }
    }

    if (framesScanned % 48 === 0) {
      opts?.onProgress?.(Math.min(1, i / Math.max(1, lastT)));
      const now = performance.now();
      if (now - lastYield > 12) {
        lastYield = now;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  close(buffer.duration);
  opts?.onProgress?.(1);

  const bpm = opts?.bpm && opts.bpm > 0 ? opts.bpm : 120;
  const name = opts?.name ?? "歌メロディ";
  const parsed = notesToParsed(notes, name);
  return {
    notes,
    parsed,
    bytes: encodeMidiFile(notes, { bpm, name }),
    framesScanned,
  };
}

export function melodySummary(notes: MidiNote[]): string {
  if (!notes.length) return "ノートなし";
  const lo = notes.reduce((m, n) => Math.min(m, n.midi), 127);
  const hi = notes.reduce((m, n) => Math.max(m, n.midi), 0);
  return `${notes.length} 音 · ${midiToNoteName(lo)}〜${midiToNoteName(hi)}`;
}
