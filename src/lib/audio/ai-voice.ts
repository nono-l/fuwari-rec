import { getAiConvertRuntime } from "./ai-convert-runtime";
import { detectPitch } from "./pitch";

/** AI voice is a single live-FX stage. Signal arrives here, then continues down the rack. */
export const MAX_AI_VOICE = 1;

export const AI_MODEL_ACCEPT = ".onnx,.pth,.pt,.index";

export type AiVoiceInsert = {
  id: string;
  name: string;
  enabled: boolean;
  /** Semitone key of this stage (−12…+12). */
  pitch: number;
  /** Model wet/dry (0–1). */
  mix: number;
  modelName: string;
  modelBytes: number;
};

const modelFiles = new Map<string, File>();

export function setAiModelFile(id: string, file: File | null) {
  if (!file) modelFiles.delete(id);
  else modelFiles.set(id, file);
}

export function getAiModelFile(id: string) {
  return modelFiles.get(id) ?? null;
}

export function hasAiModelFile(id: string, name: string) {
  const f = modelFiles.get(id);
  return Boolean(f && f.name === name);
}

export function formatModelSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function newAiVoiceInsert(patch?: Partial<AiVoiceInsert>): AiVoiceInsert {
  return {
    id:
      patch?.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: patch?.name?.trim() || "AIボイス",
    enabled: patch?.enabled !== false,
    pitch: clampPitch(patch?.pitch ?? 0),
    mix: Math.max(0, Math.min(1, patch?.mix ?? 1)),
    modelName: String(patch?.modelName ?? "").slice(0, 200),
    modelBytes: Math.max(0, Math.round(Number(patch?.modelBytes) || 0)),
  };
}

export function clampPitch(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(-12, Math.min(12, Math.round(v * 10) / 10));
}

export function aiVoiceSummary(v: AiVoiceInsert) {
  const key =
    Math.abs(v.pitch) < 0.05
      ? "キー 0"
      : `キー ${v.pitch > 0 ? "+" : ""}${v.pitch.toFixed(1)}`;
  const mix = v.mix >= 0.995 ? "" : ` · 混ぜ ${Math.round(v.mix * 100)}%`;
  const name = v.modelName.trim();
  if (!name) return `モデル未選択 · ${key}${mix}`;
  const size = formatModelSize(v.modelBytes);
  return `${name}${size ? ` ${size}` : ""} · ${key}${mix}`;
}

export type AiVoiceHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: AiVoiceInsert) => void;
  dispose: () => void;
};

/**
 * One-stage AI voice insert.
 * No model → dry + optional key.
 * .onnx → hop to onnxruntime-web (WebGPU / WASM). .pth is training-only.
 */
export function createAiVoiceHandle(
  ctx: BaseAudioContext,
  voice: AiVoiceInsert,
): AiVoiceHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const dryDelay = ctx.createDelay(0.5);
  input.gain.value = 1;
  output.gain.value = 1;
  input.connect(dryDelay);
  dryDelay.connect(dry);
  dry.connect(output);
  wet.connect(output);

  let pitch: AudioWorkletNode | null = null;
  let convert: AudioWorkletNode | null = null;
  let keyed = false;
  let modelKey = "";
  const live = isRealtime(ctx);
  const runtime = live ? getAiConvertRuntime() : null;

  const disconnectWet = () => {
    try {
      input.disconnect(pitch ?? convert ?? wet);
    } catch {
      /* noop */
    }
    if (pitch) {
      try {
        pitch.disconnect();
      } catch {
        /* noop */
      }
    }
    if (convert) {
      try {
        convert.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      input.disconnect(wet);
    } catch {
      /* noop */
    }
  };

  const wantPitch = (v: AiVoiceInsert) => Math.abs(v.pitch) >= 0.05;
  const wantConvert = (v: AiVoiceInsert) =>
    live && !!v.modelName.trim() && v.modelBytes > 0;

  const mixGains = (v: AiVoiceInsert) => {
    const m = Math.max(0, Math.min(1, v.mix));
    dry.gain.value = 1 - m;
    wet.gain.value = m <= 0.001 ? 0 : m;
  };

  const wire = (v: AiVoiceInsert) => {
    disconnectWet();
    mixGains(v);
    const shift = wantPitch(v);
    if (shift && !pitch) pitch = tryWorklet(ctx, "pitch-shift");
    if (wantConvert(v) && !convert) convert = tryWorklet(ctx, "ai-convert");
    if (shift && pitch) {
      pitch.port.postMessage({
        type: "rate",
        value: Math.pow(2, clampPitch(v.pitch) / 12),
      });
    }
    let head: AudioNode = input;
    if (shift && pitch) {
      head.connect(pitch);
      head = pitch;
    }
    if (convert) {
      head.connect(convert);
      convert.connect(wet);
      runtime?.bind(convert, v.id, v.modelName, getAiModelFile(v.id) ?? null);
      runtime?.setPitch(v.pitch);
      const onnx = /\.onnx$/i.test(v.modelName);
      runtime?.setBypass(convert, !onnx);
      dryDelay.delayTime.value = onnx ? 4096 / ctx.sampleRate : 0;
      void runtime?.ensure(v.id, v.modelName, getAiModelFile(v.id) ?? null);
    } else {
      head.connect(wet);
      dryDelay.delayTime.value = 0;
    }
    keyed = shift;
    modelKey = `${v.id}:${v.modelName}:${v.modelBytes}`;
  };

  wire(voice);

  let tapRaf = 0;
  let tapDisposed = false;
  if (live && runtime && typeof requestAnimationFrame !== "undefined") {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    const wave = new Float32Array(analyser.fftSize);
    input.connect(analyser);
    const tick = () => {
      if (tapDisposed) return;
      analyser.getFloatTimeDomainData(wave as unknown as Float32Array<ArrayBuffer>);
      const hit = detectPitch(wave, ctx.sampleRate);
      runtime.setTap(hit?.hz ?? 0);
      tapRaf = requestAnimationFrame(tick);
    };
    tapRaf = requestAnimationFrame(tick);
  }

  return {
    id: voice.id,
    input,
    output,
    apply: (next) => {
      mixGains(next);
      runtime?.setPitch(next.pitch);
      const nextKey = `${next.id}:${next.modelName}:${next.modelBytes}`;
      const shift = wantPitch(next);
      if (nextKey !== modelKey || shift !== keyed || (!!convert) !== wantConvert(next)) {
        wire(next);
        return;
      }
      if (shift && pitch) {
        pitch.port.postMessage({
          type: "rate",
          value: Math.pow(2, clampPitch(next.pitch) / 12),
        });
      }
    },
    dispose: () => {
      tapDisposed = true;
      if (tapRaf) cancelAnimationFrame(tapRaf);
      tapRaf = 0;
      disconnectWet();
      try {
        dry.disconnect();
      } catch {
        /* noop */
      }
      try {
        wet.disconnect();
      } catch {
        /* noop */
      }
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        output.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}

function isRealtime(ctx: BaseAudioContext) {
  return !("startRendering" in ctx);
}

function tryWorklet(ctx: BaseAudioContext, name: string): AudioWorkletNode | null {
  if (typeof AudioWorkletNode === "undefined") return null;
  try {
    return new AudioWorkletNode(ctx, name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    return null;
  }
}

