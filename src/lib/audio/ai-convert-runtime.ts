import { loadAiRuntimeFile } from "./ai-runtime";
import {
  convertPcm,
  createOnnxSession,
  isOnnxFile,
  type OrtSession,
} from "./ai-infer";
import { loadVoiceModel } from "./ai-voice-idb";

export type AiConvertStatus =
  | "off"
  | "loading"
  | "ready"
  | "running"
  | "unsupported"
  | "error";

export type AiConvertState = {
  status: AiConvertStatus;
  detail: string;
  provider: "" | "webgpu" | "wasm";
  lastInferMs: number;
  f0Hz: number;
  convertRatio: number;
  hopMs: number;
};

type Listener = (s: AiConvertState) => void;

const init: AiConvertState = {
  status: "off",
  detail: "モデル未選択。素通り＋キーで動きます",
  provider: "",
  lastInferMs: 0,
  f0Hz: 0,
  convertRatio: 0,
  hopMs: 0,
};

class AiConvertRuntime {
  private state: AiConvertState = { ...init };
  private listeners = new Set<Listener>();
  private voice: OrtSession | null = null;
  private hubert: OrtSession | null = null;
  private rmvpe: OrtSession | null = null;
  private voiceKey = "";
  private loadGen = 0;
  private busy = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState() {
    return this.state;
  }

  private set(patch: Partial<AiConvertState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  bind(node: AudioWorkletNode, voiceId: string, modelName: string, file: File | null) {
    node.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type !== "block" || !(msg.samples instanceof Float32Array)) return;
      void this.handleBlock(node, msg.samples, Number(msg.sr) || 48000);
    };
    void this.ensure(voiceId, modelName, file);
  }

  async ensure(voiceId: string, modelName: string, file: File | null) {
    if (!file) {
      try {
        file = await loadVoiceModel(voiceId);
      } catch {
        file = null;
      }
    }
    const key = `${voiceId}:${file?.name ?? ""}:${file?.size ?? 0}:${modelName}`;
    if (key === this.voiceKey && this.voice) return;
    const gen = ++this.loadGen;
    this.voiceKey = key;
    this.voice = null;

    if (!file || !modelName.trim()) {
      this.set({
        status: "off",
        detail: "モデル未選択。素通り＋キーで動きます",
        provider: "",
      });
      return;
    }
    if (!isOnnxFile(file)) {
      this.set({
        status: "unsupported",
        detail: ".pth / .pt は学習用です。変換には .onnx を選んでください。キーは使えます",
        provider: "",
      });
      return;
    }

    this.set({ status: "loading", detail: "ONNX を読み込み中…", provider: "" });
    try {
      const [voicePack, hubertFile, rmvpeFile] = await Promise.all([
        createOnnxSession(file),
        loadAiRuntimeFile("hubert"),
        loadAiRuntimeFile("rmvpe"),
      ]);
      if (gen !== this.loadGen) return;
      this.voice = voicePack.session;
      let provider = voicePack.provider;
      if (hubertFile && isOnnxFile(hubertFile)) {
        try {
          const h = await createOnnxSession(hubertFile);
          if (gen !== this.loadGen) return;
          this.hubert = h.session;
        } catch {
          this.hubert = null;
        }
      } else {
        this.hubert = null;
      }
      if (rmvpeFile && isOnnxFile(rmvpeFile)) {
        try {
          const r = await createOnnxSession(rmvpeFile);
          if (gen !== this.loadGen) return;
          this.rmvpe = r.session;
        } catch {
          this.rmvpe = null;
        }
      } else {
        this.rmvpe = null;
      }
      this.set({
        status: "ready",
        provider,
        detail: this.hubert
          ? `変換待機（${provider} · 土台あり）`
          : `変換待機（${provider} · 声モデルのみ）`,
      });
    } catch (e) {
      console.error(e);
      if (gen !== this.loadGen) return;
      this.voice = null;
      this.set({
        status: "error",
        provider: "",
        detail: "ONNX を読めませんでした。素通り＋キーで続けます",
      });
    }
  }

  private async handleBlock(
    node: AudioWorkletNode,
    samples: Float32Array,
    sr: number,
  ) {
    if (this.busy || !this.voice) {
      node.port.postMessage({ type: "skip" });
      this.set({
        convertRatio: 0,
        hopMs: (samples.length / Math.max(8000, sr)) * 1000,
      });
      return;
    }
    this.busy = true;
    if (this.state.status === "ready") {
      this.set({ status: "running", detail: `変換中（${this.state.provider}）` });
    }
    const t0 = performance.now();
    try {
      const out = await convertPcm({
        pcm: samples,
        sampleRate: sr,
        pitch: this.pitch,
        voice: this.voice,
        hubert: this.hubert,
        rmvpe: this.rmvpe,
      });
      if (out && out.length) {
        const pcm = matchLength(out, samples.length);
        node.port.postMessage({ type: "out", samples: pcm }, [pcm.buffer]);
        this.set({
          lastInferMs: performance.now() - t0,
          convertRatio: 1,
          hopMs: (samples.length / Math.max(8000, sr)) * 1000,
        });
      } else {
        node.port.postMessage({ type: "skip" });
        this.set({
          lastInferMs: performance.now() - t0,
          convertRatio: 0,
          detail: "このONNXの入力形では変換できません。別の .onnx を試してください",
        });
      }
    } catch (e) {
      console.error(e);
      node.port.postMessage({ type: "skip" });
      this.set({
        convertRatio: 0,
        detail: "変換に失敗しました。モデルを確認してください",
      });
    } finally {
      this.busy = false;
    }
  }

  pitch = 0;

  setTap(hz: number) {
    const f0Hz = hz > 50 ? hz : 0;
    this.set({
      f0Hz,
      convertRatio: this.voice ? this.state.convertRatio : this.state.convertRatio * 0.85,
    });
  }

  setPitch(n: number) {
    this.pitch = n;
  }

  setBypass(node: AudioWorkletNode, bypass: boolean) {
    node.port.postMessage({ type: "bypass", value: bypass });
  }

  clear() {
    this.loadGen += 1;
    this.voice = null;
    this.hubert = null;
    this.rmvpe = null;
    this.voiceKey = "";
    this.set({ ...init });
  }
}

function matchLength(src: Float32Array, n: number) {
  if (src.length === n) return src;
  const out = new Float32Array(n);
  const copy = Math.min(n, src.length);
  out.set(src.subarray(0, copy));
  return out;
}

let singleton: AiConvertRuntime | null = null;

export function getAiConvertRuntime() {
  if (!singleton) singleton = new AiConvertRuntime();
  return singleton;
}
