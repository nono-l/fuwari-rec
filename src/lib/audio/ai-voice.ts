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

function tryPitchNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  if (typeof AudioWorkletNode === "undefined") return null;
  try {
    return new AudioWorkletNode(ctx, "pitch-shift", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    return null;
  }
}

export type AiVoiceHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: AiVoiceInsert) => void;
  dispose: () => void;
};

/**
 * One-stage AI voice insert. Until a conversion model is loaded this is
 * dry-through, with optional key shift using the existing grain pitch worklet.
 */
export function createAiVoiceHandle(
  ctx: BaseAudioContext,
  voice: AiVoiceInsert,
): AiVoiceHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.gain.value = 1;
  output.gain.value = 1;
  let pitch: AudioWorkletNode | null = null;
  let keyed = false;

  const disconnectGraph = () => {
    try {
      input.disconnect();
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
  };

  const wire = (v: AiVoiceInsert) => {
    disconnectGraph();
    const want = Math.abs(v.pitch) >= 0.05;
    if (want && !pitch) pitch = tryPitchNode(ctx);
    if (want && pitch) {
      pitch.port.postMessage({
        type: "rate",
        value: Math.pow(2, clampPitch(v.pitch) / 12),
      });
      input.connect(pitch);
      pitch.connect(output);
      keyed = true;
    } else {
      input.connect(output);
      keyed = false;
    }
  };

  wire(voice);

  return {
    id: voice.id,
    input,
    output,
    apply: (next) => {
      const want = Math.abs(next.pitch) >= 0.05;
      if (want !== keyed) {
        wire(next);
        return;
      }
      if (want && pitch) {
        pitch.port.postMessage({
          type: "rate",
          value: Math.pow(2, clampPitch(next.pitch) / 12),
        });
      }
    },
    dispose: () => {
      disconnectGraph();
    },
  };
}
