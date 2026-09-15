export const MAX_DEVICE_IO = 8;

export type DeviceIoKind = "mic-in" | "speaker-out";
export type DeviceOutMode = "split" | "send";

export type DeviceIoInsert = {
  id: string;
  name: string;
  enabled: boolean;
  kind: DeviceIoKind;
  /** Empty = default device. */
  deviceId: string;
  deviceLabel: string;
  mix: number;
  /** speaker-out: split keeps the chain, send mutes dry. */
  mode: DeviceOutMode;
};

export function newDeviceIoInsert(
  kind: DeviceIoKind,
  patch?: Partial<DeviceIoInsert>,
): DeviceIoInsert {
  return {
    id:
      patch?.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    kind,
    deviceId: String(patch?.deviceId ?? ""),
    deviceLabel: String(patch?.deviceLabel ?? ""),
    mix: Math.max(0, Math.min(1, Number(patch?.mix) || 1)),
    mode: patch?.mode === "send" ? "send" : "split",
    enabled: patch?.enabled !== false,
    name:
      patch?.name?.trim() ||
      (kind === "mic-in" ? "マイクから入力" : "スピーカーへ出力"),
  };
}

export function deviceIoSummary(d: DeviceIoInsert) {
  const dev = d.deviceLabel.trim() || (d.deviceId ? "選択デバイス" : "既定");
  if (d.kind === "mic-in") {
    return `${dev} · ${Math.round(d.mix * 100)}%`;
  }
  return d.mode === "send" ? `${dev}へ送り切り` : `${dev}へ分岐`;
}

export function defaultDeviceIoName(d: DeviceIoInsert) {
  return d.kind === "mic-in" ? "マイクから入力" : "スピーカーへ出力";
}

type MicRec = {
  tap: GainNode;
  stream: MediaStream | null;
  src: MediaStreamAudioSourceNode | null;
  live: boolean;
};

type SpkRec = {
  tap: GainNode;
  sat: AudioContext | null;
  dest: MediaStreamAudioDestinationNode | null;
};

/**
 * Extra hardware I/O for live-FX stages.
 * Mic taps mix a device (or the live mic) into the chain.
 * Speaker taps copy the chain to a sink (satellite AudioContext if needed).
 */
export class DeviceIoBay {
  private mics = new Map<string, MicRec>();
  private speakers = new Map<string, SpkRec>();
  private liveMic: AudioNode | null = null;

  constructor(private ctx: AudioContext) {}

  setLiveMic(node: AudioNode | null) {
    const prev = this.liveMic;
    this.liveMic = node;
    for (const rec of this.mics.values()) {
      if (!rec.live) continue;
      if (prev) {
        try {
          prev.disconnect(rec.tap);
        } catch {
          /* noop */
        }
      }
      if (node) {
        try {
          node.connect(rec.tap);
        } catch {
          /* noop */
        }
      }
    }
  }

  micInput(deviceId: string): GainNode {
    const key = deviceId || "default";
    let rec = this.mics.get(key);
    if (rec) return rec.tap;
    const tap = this.ctx.createGain();
    tap.gain.value = 1;
    rec = { tap, stream: null, src: null, live: !deviceId };
    this.mics.set(key, rec);
    if (!deviceId && this.liveMic) {
      try {
        this.liveMic.connect(tap);
      } catch {
        /* noop */
      }
    } else {
      rec.live = false;
      void this.startMic(key, deviceId);
    }
    return tap;
  }

  speakerOutput(deviceId: string): GainNode {
    const key = deviceId || "default";
    let rec = this.speakers.get(key);
    if (rec) return rec.tap;
    const tap = this.ctx.createGain();
    tap.gain.value = 1;
    rec = { tap, sat: null, dest: null };
    this.speakers.set(key, rec);
    if (deviceId && supportsSink(this.ctx)) {
      void this.wireSatellite(key, deviceId, tap);
    } else {
      tap.connect(this.ctx.destination);
    }
    return tap;
  }

  stopExtras() {
    for (const rec of this.mics.values()) {
      rec.src = null;
      if (rec.stream) {
        rec.stream.getTracks().forEach((t) => t.stop());
        rec.stream = null;
      }
    }
  }

  dispose() {
    this.stopExtras();
    for (const rec of this.mics.values()) {
      try {
        rec.tap.disconnect();
      } catch {
        /* noop */
      }
    }
    this.mics.clear();
    for (const rec of this.speakers.values()) {
      try {
        rec.tap.disconnect();
      } catch {
        /* noop */
      }
      if (rec.sat) void rec.sat.close();
    }
    this.speakers.clear();
    this.liveMic = null;
  }

  private async startMic(key: string, deviceId: string) {
    const rec = this.mics.get(key);
    if (!rec) return;
    try {
      const audio: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: false }
        : { echoCancellation: false };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: false,
      });
      if (!this.mics.has(key)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const src = this.ctx.createMediaStreamSource(stream);
      src.connect(rec.tap);
      rec.stream = stream;
      rec.src = src;
    } catch (e) {
      console.warn("device-io mic", e);
    }
  }

  private async wireSatellite(key: string, deviceId: string, tap: GainNode) {
    try {
      const sat = new AudioContext({ sampleRate: this.ctx.sampleRate });
      const proto = sat as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (proto.setSinkId) await proto.setSinkId(deviceId);
      const dest = this.ctx.createMediaStreamDestination();
      tap.connect(dest);
      const src = sat.createMediaStreamSource(dest.stream);
      src.connect(sat.destination);
      if (sat.state === "suspended") await sat.resume();
      const rec = this.speakers.get(key);
      if (rec) {
        rec.sat = sat;
        rec.dest = dest;
      } else {
        void sat.close();
      }
    } catch (e) {
      console.warn("device-io speaker", e);
      try {
        tap.connect(this.ctx.destination);
      } catch {
        /* noop */
      }
    }
  }
}

function supportsSink(ctx: AudioContext) {
  return typeof (ctx as AudioContext & { setSinkId?: unknown }).setSinkId ===
    "function";
}

export type DeviceIoHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: DeviceIoInsert) => void;
  dispose: () => void;
};

export function createDeviceIoHandle(
  ctx: BaseAudioContext,
  insert: DeviceIoInsert,
  bay: DeviceIoBay | null,
): DeviceIoHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const send = ctx.createGain();
  input.gain.value = 1;
  output.gain.value = 1;

  const wire = (v: DeviceIoInsert) => {
    try {
      input.disconnect();
    } catch {
      /* noop */
    }
    try {
      dry.disconnect();
    } catch {
      /* noop */
    }
    try {
      send.disconnect();
    } catch {
      /* noop */
    }
    if (v.kind === "mic-in") {
      dry.gain.value = 1;
      send.gain.value = v.mix;
      input.connect(dry);
      dry.connect(output);
      if (bay) {
        bay.micInput(v.deviceId).connect(send);
        send.connect(output);
      }
    } else {
      dry.gain.value = v.mode === "send" ? 0 : 1;
      send.gain.value = v.mix;
      input.connect(dry);
      dry.connect(output);
      input.connect(send);
      if (bay) send.connect(bay.speakerOutput(v.deviceId));
    }
  };

  wire(insert);
  let cur = insert;

  return {
    id: insert.id,
    input,
    output,
    apply: (next) => {
      if (
        next.kind !== cur.kind ||
        next.deviceId !== cur.deviceId ||
        next.mode !== cur.mode
      ) {
        wire(next);
        cur = next;
        return;
      }
      if (next.kind === "mic-in") send.gain.value = next.mix;
      else {
        dry.gain.value = next.mode === "send" ? 0 : 1;
        send.gain.value = next.mix;
      }
    },
    dispose: () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        dry.disconnect();
      } catch {
        /* noop */
      }
      try {
        send.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}
