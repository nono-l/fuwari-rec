export const ROOM_FFT = 1024;

export type RoomProfile = {
  bins: number[];
  fftSize: number;
  frames: number;
  capturedAt: number;
};

export function emptyRoomProfile(): RoomProfile {
  return { bins: [], fftSize: ROOM_FFT, frames: 0, capturedAt: 0 };
}

function fft(re: Float32Array, im: Float32Array, invert: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlenRe - wi * wlenIm;
        wi = wr * wlenIm + wi * wlenRe;
        wr = nwr;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i]! /= n;
      im[i]! /= n;
    }
  }
}

function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** Spectral subtraction for offline / export. Same math as the live worklet. */
export function subtractRoomFromBuffer(
  buffer: AudioBuffer,
  profile: RoomProfile,
  amount: number,
): AudioBuffer {
  if (!profile.bins.length || amount < 0.02) return buffer;
  const fftSize = ROOM_FFT;
  const hop = fftSize / 2;
  const bins = fftSize / 2;
  const win = hann(fftSize);
  const noise = new Float32Array(bins);
  const ncopy = Math.min(bins, profile.bins.length);
  for (let i = 0; i < ncopy; i++) noise[i] = profile.bins[i] ?? 0;

  const out = new AudioBuffer({
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });

  const alpha = 1 + amount * 2.2;
  const floor = 0.06 + (1 - amount) * 0.22;
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = out.getChannelData(c);
    const ola = new Float32Array(buffer.length + fftSize);
    for (let pos = 0; pos + fftSize <= src.length; pos += hop) {
      for (let i = 0; i < fftSize; i++) {
        re[i] = (src[pos + i] ?? 0) * (win[i] ?? 0);
        im[i] = 0;
      }
      fft(re, im, false);
      for (let k = 0; k < bins; k++) {
        const mag = Math.hypot(re[k]!, im[k]!);
        const phase = Math.atan2(im[k]!, re[k]!);
        const next = Math.max(mag - alpha * (noise[k] ?? 0), mag * floor);
        const cr = next * Math.cos(phase);
        const ci = next * Math.sin(phase);
        re[k] = cr;
        im[k] = ci;
        if (k > 0) {
          re[fftSize - k] = cr;
          im[fftSize - k] = -ci;
        }
      }
      fft(re, im, true);
      for (let i = 0; i < fftSize; i++) {
        ola[pos + i]! += re[i]! * (win[i] ?? 0);
      }
    }
    dest.set(ola.subarray(0, dest.length));
  }
  return out;
}
