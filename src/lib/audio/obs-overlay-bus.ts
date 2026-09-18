export const OBS_CHANNEL = "fuwari-obs-overlay";
export const OBS_BARS = 48;

export type ObsOverlayFrame = {
  scene: string;
  live: boolean;
  bars: number[];
};

export function downsampleSpectrum(bins: Uint8Array, n = OBS_BARS) {
  const out: number[] = [];
  const len = bins.length;
  if (!len) return out;
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let m = 0;
    for (let j = a; j < b && j < len; j++) {
      if (bins[j]! > m) m = bins[j]!;
    }
    out.push(Math.min(1, Math.pow(m / 255, 0.55)));
  }
  return out;
}

let pub: BroadcastChannel | null = null;
let posting = false;
let queued: ObsOverlayFrame | null = null;

function sendQueued() {
  const frame = queued;
  if (!frame || posting || typeof fetch === "undefined") return;
  queued = null;
  posting = true;
  void fetch("/api/obs-overlay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(frame),
    keepalive: true,
  }).finally(() => {
    posting = false;
    if (queued) sendQueued();
  });
}

export function publishObsOverlay(frame: ObsOverlayFrame) {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      if (!pub) pub = new BroadcastChannel(OBS_CHANNEL);
      pub.postMessage(frame);
    } catch {
      /* private mode */
    }
  }
  queued = frame;
  sendQueued();
}

export function subscribeObsOverlay(fn: (f: ObsOverlayFrame) => void) {
  let stop = false;
  let ch: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      ch = new BroadcastChannel(OBS_CHANNEL);
      ch.onmessage = (ev) => {
        const d = ev.data as ObsOverlayFrame;
        if (!d || !Array.isArray(d.bars)) return;
        fn(d);
      };
    } catch {
      ch = null;
    }
  }
  const pull = async () => {
    try {
      const res = await fetch("/api/obs-overlay", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as ObsOverlayFrame;
      if (!stop && d && Array.isArray(d.bars)) fn(d);
    } catch {
      /* overlay tab may load before API */
    }
  };
  void pull();
  const id = window.setInterval(() => void pull(), 90);
  return () => {
    stop = true;
    window.clearInterval(id);
    ch?.close();
  };
}

export function obsOverlayUrl() {
  if (typeof window === "undefined") return "/obs";
  return `${window.location.origin}/obs`;
}
