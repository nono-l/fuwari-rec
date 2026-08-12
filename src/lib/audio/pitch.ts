/** Note names (scientific pitch notation, A4 = 440Hz). */
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]!;
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function formatHz(hz: number): string {
  if (hz < 10) return "—";
  return `${hz.toFixed(1)} Hz`;
}

export function centsBetween(aHz: number, bHz: number): number {
  return 1200 * Math.log2(aHz / bHz);
}

/**
 * Autocorrelation pitch detection (YIN-inspired, lightweight).
 * Tuned for singing voice ~70–1000 Hz.
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  opts?: { minHz?: number; maxHz?: number },
): { hz: number; confidence: number; rms: number } | null {
  const minHz = opts?.minHz ?? 70;
  const maxHz = opts?.maxHz ?? 1000;
  const size = buffer.length;

  // RMS / silence gate
  let sumSq = 0;
  for (let i = 0; i < size; i++) {
    const v = buffer[i]!;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / size);
  if (rms < 0.01) return null;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), size - 2);
  if (maxLag <= minLag + 2) return null;

  // Difference function (YIN-style)
  const yin = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) {
      const d = buffer[i]! - buffer[i + lag]!;
      sum += d * d;
    }
    yin[lag] = sum;
  }

  // Cumulative mean normalized difference
  yin[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += yin[lag]!;
    yin[lag] = running > 0 ? (yin[lag]! * lag) / running : 1;
  }

  const threshold = 0.15;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (yin[lag]! < threshold) {
      // local minimum
      while (lag + 1 <= maxLag && yin[lag + 1]! < yin[lag]!) lag++;
      bestLag = lag;
      break;
    }
  }

  if (bestLag < 0) {
    // fallback: absolute minimum
    let minVal = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (yin[lag]! < minVal) {
        minVal = yin[lag]!;
        bestLag = lag;
      }
    }
    if (minVal > 0.35) return null;
  }

  // Parabolic interpolation
  const y0 = yin[bestLag - 1] ?? yin[bestLag]!;
  const y1 = yin[bestLag]!;
  const y2 = yin[bestLag + 1] ?? yin[bestLag]!;
  const denom = 2 * (2 * y1 - y2 - y0);
  let refined = bestLag;
  if (Math.abs(denom) > 1e-9) {
    refined = bestLag + (y0 - y2) / denom;
  }

  const hz = sampleRate / refined;
  if (hz < minHz || hz > maxHz || !Number.isFinite(hz)) return null;

  const confidence = Math.max(0, Math.min(1, 1 - y1));
  if (confidence < 0.55) return null;

  return { hz, confidence, rms };
}

/** How many semitones between two midi values (absolute). */
export function semitoneSpan(minMidi: number, maxMidi: number): number {
  return Math.max(0, Math.round(maxMidi) - Math.round(minMidi));
}
