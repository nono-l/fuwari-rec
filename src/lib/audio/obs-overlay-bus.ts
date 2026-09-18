export const OBS_CHANNEL = "fuwari-obs-overlay";
export const OBS_BARS = 48;

export type ObsOverlayFrame = {
  scene: string;
  live: boolean;
  bars: number[];
};

export function downsampleSpectrum(bins: Uint8Array, n = OBS_BARS) {
  const out: number[] = [];
  if (!bins.length) return out;
  const step = bins.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let m = 0;
    for (let j = a; j < b && j < bins.length; j++) {
      if (bins[j]! > m) m = bins[j]!;
    }
    out.push(m / 255);
  }
  return out;
}

let pub: BroadcastChannel | null = null;

export function publishObsOverlay(frame: ObsOverlayFrame) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    if (!pub) pub = new BroadcastChannel(OBS_CHANNEL);
    pub.postMessage(frame);
  } catch {
    /* private mode */
  }
}

export function subscribeObsOverlay(fn: (f: ObsOverlayFrame) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  try {
    const ch = new BroadcastChannel(OBS_CHANNEL);
    ch.onmessage = (ev) => {
      const d = ev.data as ObsOverlayFrame;
      if (!d || !Array.isArray(d.bars)) return;
      fn(d);
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}

export function obsOverlayUrl() {
  if (typeof window === "undefined") return "/obs";
  return `${window.location.origin}/obs`;
}
