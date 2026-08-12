import {
  centsBetween,
  detectPitch,
  hzToMidi,
  midiToNoteName,
  semitoneSpan,
} from "./pitch";

export interface MediaRangeResult {
  minHz: number;
  maxHz: number;
  minNote: string;
  maxNote: string;
  spanSemitones: number;
  stableHits: number;
  framesScanned: number;
  durationSec: number;
  usedVocalIsolation: boolean;
  trackId: string;
  trackName: string;
}

function monoFromBuffer(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const n = buffer.numberOfChannels;
  for (let ch = 0; ch < n; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      out[i]! += (data[i] ?? 0) / n;
    }
  }
  return out;
}

/**
 * Scan an AudioBuffer for sustained pitch and return min/max range.
 * Designed for sung vocals after instrumental cancellation.
 */
export async function analyzeBufferVocalRange(
  buffer: AudioBuffer,
  opts?: {
    onProgress?: (p: number) => void;
    /** Require this many consecutive stable frames (~frameHop) */
    stableFrames?: number;
    centsTolerance?: number;
  },
): Promise<Omit<
  MediaRangeResult,
  "usedVocalIsolation" | "trackId" | "trackName"
> | null> {
  const sampleRate = buffer.sampleRate;
  const mono = monoFromBuffer(buffer);
  const frameSize = 2048;
  const hop = 1024;
  const needStable = opts?.stableFrames ?? 4; // ~90ms
  const centsTol = opts?.centsTolerance ?? 45;

  let minHz: number | null = null;
  let maxHz: number | null = null;
  let framesScanned = 0;
  let stableHits = 0;

  let holdHz: number | null = null;
  let holdCount = 0;

  const total = Math.max(1, mono.length - frameSize);
  let lastYield = performance.now();

  for (let i = 0; i + frameSize < mono.length; i += hop) {
    framesScanned++;
    const slice = mono.subarray(i, i + frameSize);
    // copy — detectPitch may assume contiguous buffer length
    const frame = new Float32Array(frameSize);
    frame.set(slice);

    const detected = detectPitch(frame, sampleRate);
    if (!detected || detected.confidence < 0.6 || detected.rms < 0.015) {
      holdHz = null;
      holdCount = 0;
    } else if (
      holdHz != null &&
      Math.abs(centsBetween(detected.hz, holdHz)) <= centsTol
    ) {
      holdCount++;
      if (holdCount >= needStable) {
        const ref = holdHz;
        if (minHz == null || ref < minHz) minHz = ref;
        if (maxHz == null || ref > maxHz) maxHz = ref;
        stableHits++;
      }
    } else {
      holdHz = detected.hz;
      holdCount = 1;
    }

    if (framesScanned % 40 === 0) {
      opts?.onProgress?.(Math.min(1, i / total));
      const now = performance.now();
      if (now - lastYield > 12) {
        lastYield = now;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  opts?.onProgress?.(1);

  if (minHz == null || maxHz == null) return null;

  return {
    minHz,
    maxHz,
    minNote: midiToNoteName(hzToMidi(minHz)),
    maxNote: midiToNoteName(hzToMidi(maxHz)),
    spanSemitones: semitoneSpan(hzToMidi(minHz), hzToMidi(maxHz)),
    stableHits,
    framesScanned,
    durationSec: buffer.duration,
  };
}
