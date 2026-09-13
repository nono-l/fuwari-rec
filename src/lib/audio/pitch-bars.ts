import type { MidiNote } from "./midi";
import { ensureNoteIds } from "./midi-edit";

const XFADE = 0.008;
const GRAIN = 1024;
const HOP = 256;
const SEARCH = 64;

export function stampPitchSources(notes: MidiNote[]): MidiNote[] {
  return ensureNoteIds(notes).map((n) => ({
    ...n,
    sourceStart: n.sourceStart ?? n.start,
    sourceDuration: n.sourceDuration ?? n.duration,
    sourceMidi: n.sourceMidi ?? n.midi,
  }));
}

export function pitchBarChanged(n: MidiNote): boolean {
  const srcMidi = n.sourceMidi ?? n.midi;
  const srcStart = n.sourceStart ?? n.start;
  const srcDur = n.sourceDuration ?? n.duration;
  return (
    srcMidi !== n.midi ||
    Math.abs(srcStart - n.start) > 0.001 ||
    Math.abs(srcDur - n.duration) > 0.001
  );
}

function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  return w;
}

function resample(src: Float32Array, ratio: number): Float32Array {
  if (!src.length) return src;
  if (Math.abs(ratio - 1) < 0.0008) return src.slice();
  const outLen = Math.max(1, Math.round(src.length / ratio));
  const out = new Float32Array(outLen);
  const last = src.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.min(last, Math.max(0, Math.floor(x)));
    const i1 = Math.min(last, i0 + 1);
    const f = x - Math.floor(x);
    out[i] = src[i0]! + (src[i1]! - src[i0]!) * f;
  }
  return out;
}

function wsola(src: Float32Array, timeRatio: number): Float32Array {
  if (!src.length) return src;
  if (Math.abs(timeRatio - 1) < 0.02 || src.length < GRAIN * 2) {
    return resample(src, 1 / Math.max(0.25, timeRatio));
  }
  const outLen = Math.max(GRAIN, Math.round(src.length * timeRatio));
  const out = new Float32Array(outLen);
  const win = hann(GRAIN);
  const hopOut = Math.max(32, Math.round(HOP * timeRatio));
  let read = 0;
  let write = 0;
  let prev = 0;
  while (write + GRAIN < outLen && read + GRAIN + SEARCH < src.length) {
    let best = read;
    let bestScore = -Infinity;
    const lo = Math.max(0, read - SEARCH);
    const hi = Math.min(src.length - GRAIN, read + SEARCH);
    for (let c = lo; c <= hi; c += 4) {
      let s = 0;
      const overlap = Math.min(GRAIN / 2, write);
      if (write > 0 && overlap > 8) {
        for (let i = 0; i < GRAIN / 2; i++) {
          s += out[write + i]! * src[c + i]!;
        }
      } else {
        for (let i = 0; i < 64; i++) s += src[prev + i]! * src[c + i]!;
      }
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    for (let i = 0; i < GRAIN; i++) {
      out[write + i]! += src[best + i]! * win[i]!;
    }
    prev = best;
    write += hopOut;
    read += HOP;
  }
  return out;
}

function processSlice(
  src: Float32Array,
  pitchRatio: number,
  outLen: number,
): Float32Array {
  const pr = Math.max(0.5, Math.min(2, pitchRatio));
  if (src.length < 32) {
    return resample(src, src.length / Math.max(1, outLen));
  }
  const stretch = (outLen * pr) / src.length;
  const stretched = wsola(src, stretch);
  const pitched = resample(stretched, pr);
  if (pitched.length === outLen) return pitched;
  return resample(pitched, pitched.length / Math.max(1, outLen));
}

function fadeMute(ch: Float32Array, start: number, end: number, fade: number) {
  const a = Math.max(0, Math.min(ch.length, start));
  const b = Math.max(a, Math.min(ch.length, end));
  const f = Math.max(1, fade);
  for (let i = a; i < b; i++) {
    const head = i - a;
    const tail = b - 1 - i;
    let g = 0;
    if (head < f) g = 1 - head / f;
    else if (tail < f) g = 1 - tail / f;
    ch[i] = (ch[i] ?? 0) * g;
  }
}

function mixAt(
  dest: Float32Array,
  src: Float32Array,
  at: number,
  fade: number,
) {
  const f = Math.max(1, fade);
  for (let i = 0; i < src.length; i++) {
    const o = at + i;
    if (o < 0 || o >= dest.length) continue;
    let g = 1;
    if (i < f) g = i / f;
    else if (src.length - 1 - i < f) g = (src.length - 1 - i) / f;
    dest[o] = (dest[o] ?? 0) + src[i]! * g;
  }
}

/**
 * Rebuild a vocal buffer from pitch bars. Unchanged notes keep the original
 * audio. Moved / retuned / resized notes are grain-shifted from the source slice.
 */
export async function renderPitchBars(
  source: AudioBuffer,
  notes: MidiNote[],
  onProgress?: (p: number) => void,
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const fade = Math.max(8, Math.round(XFADE * sr));
  const extra = notes.reduce(
    (m, n) => Math.max(m, n.start + n.duration),
    source.duration,
  );
  const length = Math.max(source.length, Math.ceil(extra * sr) + fade * 2);
  const ctx = new OfflineAudioContext(source.numberOfChannels, length, sr);
  const out = ctx.createBuffer(source.numberOfChannels, length, sr);

  for (let c = 0; c < source.numberOfChannels; c++) {
    const dest = out.getChannelData(c);
    dest.set(source.getChannelData(c).subarray(0, Math.min(source.length, length)));
  }

  const changed = notes.filter(pitchBarChanged);
  const nCh = source.numberOfChannels;
  let lastYield = performance.now();

  for (let i = 0; i < changed.length; i++) {
    const n = changed[i]!;
    const srcStart = n.sourceStart ?? n.start;
    const srcDur = Math.max(0.03, n.sourceDuration ?? n.duration);
    const src0 = Math.max(0, Math.floor(srcStart * sr));
    const src1 = Math.min(source.length, Math.ceil((srcStart + srcDur) * sr));
    const dst0 = Math.max(0, Math.floor(n.start * sr));
    const outLen = Math.max(16, Math.round(Math.max(0.03, n.duration) * sr));
    const semis = n.midi - (n.sourceMidi ?? n.midi);
    const ratio = 2 ** (semis / 12);

    for (let c = 0; c < nCh; c++) {
      fadeMute(out.getChannelData(c), src0, src1, fade);
    }
    for (let c = 0; c < nCh; c++) {
      const slice = source.getChannelData(c).subarray(src0, src1);
      const processed = processSlice(slice, ratio, outLen);
      mixAt(out.getChannelData(c), processed, dst0, fade);
    }

    onProgress?.(changed.length ? (i + 1) / changed.length : 1);
    const now = performance.now();
    if (now - lastYield > 16) {
      lastYield = now;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(1);
  return out;
}

/** One-note bake for audition after a pitch / length edit. */
export function renderOnePitchBar(
  source: AudioBuffer,
  note: MidiNote,
): AudioBuffer {
  const sr = source.sampleRate;
  const srcStart = note.sourceStart ?? note.start;
  const srcDur = Math.max(0.03, note.sourceDuration ?? note.duration);
  const src0 = Math.max(0, Math.floor(srcStart * sr));
  const src1 = Math.min(source.length, Math.ceil((srcStart + srcDur) * sr));
  const outLen = Math.max(16, Math.round(Math.max(0.03, note.duration) * sr));
  const semis = note.midi - (note.sourceMidi ?? note.midi);
  const ratio = 2 ** (semis / 12);
  const nCh = source.numberOfChannels;
  const ctx = new OfflineAudioContext(nCh, outLen, sr);
  const out = ctx.createBuffer(nCh, outLen, sr);
  const fade = Math.max(8, Math.round(XFADE * sr));
  for (let c = 0; c < nCh; c++) {
    const slice = source.getChannelData(c).subarray(src0, src1);
    const processed = processSlice(slice, ratio, outLen);
    const dest = out.getChannelData(c);
    const f = Math.min(fade, Math.floor(processed.length / 3));
    for (let i = 0; i < processed.length && i < dest.length; i++) {
      let g = 1;
      if (i < f) g = i / f;
      else if (processed.length - 1 - i < f) g = (processed.length - 1 - i) / f;
      dest[i] = processed[i]! * g;
    }
  }
  return out;
}
