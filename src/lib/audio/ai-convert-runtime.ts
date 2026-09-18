import { loadAiRuntimeFile } from "./ai-runtime";
import {
  classifySession,
  convertPcm,
  createOnnxSession,
  formatConvertFail,
  isOnnxFile,
  type ConvertKind,
  type OrtSession,
} from "./ai-infer";
import { peekUtterance } from "./live-transcript";

export type AiConvertStatus =
  | "off"
  | "loading"
  | "ready"
  | "running"
  | "unsupported"
  | "error";

export type AiHopResult = "idle" | "busy" | "ok" | "fail" | "skip";

export type AiConvertState = {
  status: AiConvertStatus;
  detail: string;
  provider: "" | "webgpu" | "wasm";
  lastInferMs: number;
  f0Hz: number;
  convertRatio: number;
  hopMs: number;
  busy: boolean;
  inferStartedAt: number;
  attempts: number;
  okCount: number;
  failCount: number;
  skipCount: number;
  lastResult: AiHopResult;
  voiceName: string;
  hubertName: string;
  rmvpeName: string;
  voiceKind: ConvertKind | "";
  voiceReady: boolean;
  hubertReady: boolean;
  rmvpeReady: boolean;
  log: string[];
  contentFrames: number;
  contentWidth: number;
  contentBars: string;
  contentEnergy: number;
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
  busy: false,
  inferStartedAt: 0,
  attempts: 0,
  okCount: 0,
  failCount: 0,
  skipCount: 0,
  lastResult: "idle",
  voiceName: "",
  hubertName: "",
  rmvpeName: "",
  voiceKind: "",
  voiceReady: false,
  hubertReady: false,
  rmvpeReady: false,
  log: [],
  contentFrames: 0,
  contentWidth: 0,
  contentBars: "",
  contentEnergy: 0,
};

class AiConvertRuntime {
  private state: AiConvertState = { ...init };
  private listeners = new Set<Listener>();
  private voice: OrtSession | null = null;
  private hubert: OrtSession | null = null;
  private rmvpe: OrtSession | null = null;
  private voiceKey = "";
  private voiceName = "";
  private hubertName = "";
  private rmvpeName = "";
  private voiceKind: ConvertKind | "" = "";
  private loadGen = 0;
  private busy = false;
  private lastFail = "";
  private lastSkipUi = 0;
  private pulse: number | null = null;
  private ttsHoldUntil = 0;

  private pushLog(line: string) {
    const log = [...this.state.log, line].slice(-8);
    this.set({ log });
  }

  private startPulse() {
    if (this.pulse != null || typeof window === "undefined") return;
    this.pulse = window.setInterval(() => {
      if (!this.busy) return;
      this.set({ inferStartedAt: this.state.inferStartedAt });
    }, 250);
  }

  private stopPulse() {
    if (this.pulse == null || typeof window === "undefined") return;
    window.clearInterval(this.pulse);
    this.pulse = null;
  }

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
        detail: `「${file.name}」は .pt / .pth です。変換には .onnx が必要です`,
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
      this.voiceName = file.name;
      this.voiceKind = classifySession(voicePack.session);
      let provider = voicePack.provider;
      if (this.voiceKind === "sbvits" && provider === "webgpu") {
        try {
          const wasmPack = await createOnnxSession(file, { wasmOnly: true });
          if (gen !== this.loadGen) return;
          this.voice = wasmPack.session;
          provider = wasmPack.provider;
        } catch {
          /* keep gpu session */
        }
      }
      if (hubertFile && isOnnxFile(hubertFile)) {
        try {
          const h = await createOnnxSession(hubertFile);
          if (gen !== this.loadGen) return;
          this.hubert = h.session;
          this.hubertName = hubertFile.name;
        } catch {
          this.hubert = null;
          this.hubertName = hubertFile.name;
        }
      } else {
        this.hubert = null;
        this.hubertName = hubertFile && !isOnnxFile(hubertFile) ? hubertFile.name : "";
      }
      if (rmvpeFile && isOnnxFile(rmvpeFile)) {
        try {
          const r = await createOnnxSession(rmvpeFile);
          if (gen !== this.loadGen) return;
          this.rmvpe = r.session;
          this.rmvpeName = rmvpeFile.name;
        } catch {
          this.rmvpe = null;
          this.rmvpeName = rmvpeFile.name;
        }
      } else {
        this.rmvpe = null;
        this.rmvpeName = rmvpeFile && !isOnnxFile(rmvpeFile) ? rmvpeFile.name : "";
      }
      const kindJa =
        this.voiceKind === "rvc" ? "RVC" : this.voiceKind === "audio2audio" ? "音声→音声" : this.voiceKind === "sbvits" ? "Style-Bert-VITS2" : "不明";
      this.set({
        status: "ready",
        provider,
        voiceName: this.voiceName,
        hubertName: this.hubertName,
        rmvpeName: this.rmvpeName,
        voiceKind: this.voiceKind,
        voiceReady: true,
        hubertReady: Boolean(this.hubert),
        rmvpeReady: Boolean(this.rmvpe),
        attempts: 0,
        okCount: 0,
        failCount: 0,
        skipCount: 0,
        lastResult: "idle",
        log: [
          `声 ${this.voiceName}（${kindJa}）`,
          this.hubert
            ? `土台 ${this.hubertName}`
            : "土台なし",
          this.rmvpe ? `ピッチ ${this.rmvpeName}` : "ピッチ抽出なし",
          `${provider} で待機`,
        ],
          detail: this.voiceKind === "sbvits"
            ? `Style-Bert-VITS2 です。文字起こしを開始すると、その文章を「${this.voiceName}」の声で合成します（${provider}）`
            : this.hubert
          ? `変換待機（${provider} · 声「${this.voiceName}」${kindJa} · 土台「${this.hubertName}」）`
          : `変換待機（${provider} · 声「${this.voiceName}」${kindJa} · 土台なし）`,
      });
    } catch (e) {
      console.error(e);
      if (gen !== this.loadGen) return;
      this.voice = null;
      this.set({
        status: "error",
        provider: "",
        detail: `声モデル「${file.name}」をONNXとして開けませんでした。素通り＋キーで続けます`,
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
        convertRatio: this.state.convertRatio,
        hopMs: (samples.length / Math.max(8000, sr)) * 1000,
      });
      return;
    }
    if (this.voiceKind === "sbvits") {
      if (performance.now() < this.ttsHoldUntil || !peekUtterance()) {
        node.port.postMessage({ type: "skip" });
        return;
      }
    }
    this.busy = true;
    if (this.state.status === "ready") {
      this.set({
        status: "running",
        detail: `初回推論中（${this.state.provider || "wasm"}）…まだ成功ではありません`,
      });
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
        voiceName: this.voiceName,
        hubertName: this.hubertName,
        rmvpeName: this.rmvpeName,
      });
      if ("skip" in out) {
        node.port.postMessage({ type: "skip" });
        return;
      }
      if ("pcm" in out && out.pcm.length) {
        const raw = out.pcm;
        const pcm =
          this.voiceKind === "sbvits"
            ? raw
            : matchLength(raw, samples.length);
        node.port.postMessage({ type: "out", samples: pcm }, [pcm.buffer]);
        if (this.voiceKind === "sbvits") {
          this.ttsHoldUntil = performance.now() + (pcm.length / Math.max(8000, sr)) * 1000;
        }
        this.lastFail = "";
        this.set({
          lastInferMs: performance.now() - t0,
          convertRatio: 1,
          hopMs: (samples.length / Math.max(8000, sr)) * 1000,
          lastResult: "ok",
          okCount: this.state.okCount + 1,
          attempts: this.state.attempts + 1,
          busy: false,
          contentFrames: out.content?.frames ?? this.state.contentFrames,
          contentWidth: out.content?.width ?? this.state.contentWidth,
          contentBars: out.content?.bars ?? this.state.contentBars,
          contentEnergy: out.content?.energy ?? this.state.contentEnergy,
          detail:
            this.voiceKind === "sbvits"
              ? `合成できています（${this.state.provider} · ${this.voiceName} · Style-Bert-VITS2）`
              : `変換できています（${this.state.provider} · ${this.voiceName}）`,
        });
      } else {
        node.port.postMessage({ type: "skip" });
        const fail = "fail" in out ? out.fail : null;
        const content = fail?.content;
        const detail = fail
          ? formatConvertFail(fail)
          : "このONNXの入力形では変換できません";
        this.lastFail = detail;
        this.set({
          lastInferMs: performance.now() - t0,
          convertRatio: 0,
          hopMs: (samples.length / Math.max(8000, sr)) * 1000,
          lastResult: "fail",
          failCount: this.state.failCount + 1,
          attempts: this.state.attempts + 1,
          busy: false,
          contentFrames: content?.frames ?? this.state.contentFrames,
          contentWidth: content?.width ?? this.state.contentWidth,
          contentBars: content?.bars ?? this.state.contentBars,
          contentEnergy: content?.energy ?? this.state.contentEnergy,
          detail,
        });
      }
    } catch (e) {
      console.error(e);
      node.port.postMessage({ type: "skip" });
      this.set({
        convertRatio: 0,
        detail: `変換に失敗 · 声「${this.voiceName}」: ${e instanceof Error ? e.message.slice(0, 120) : "不明"}`,
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
    this.voiceName = "";
    this.hubertName = "";
    this.rmvpeName = "";
    this.voiceKind = "";
    this.lastFail = "";
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
