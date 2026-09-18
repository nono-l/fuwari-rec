import { detectPitch } from "./pitch";

export type OrtTensor = {
  data: Float32Array | BigInt64Array | number[];
  dims?: number[];
};

export type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

export type OrtModule = {
  env: { wasm: { wasmPaths: string; numThreads: number; simd: boolean } };
  InferenceSession: {
    create: (
      buf: ArrayBuffer,
      opts: { executionProviders: string[] },
    ) => Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array | BigInt64Array,
    dims: number[],
  ) => unknown;
};

export type ConvertKind = "audio2audio" | "rvc" | "sbvits" | "none";

const ORT_WASM =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.1/dist/";

let ortPromise: Promise<OrtModule> | null = null;

export function isOnnxFile(file: File | null | undefined) {
  if (!file) return false;
  return /\.onnx$/i.test(file.name);
}

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (!input.length) return input;
  if (Math.abs(fromRate - toRate) < 0.5) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.min(last, Math.floor(x));
    const i1 = Math.min(last, i0 + 1);
    const f = x - i0;
    out[i] = input[i0]! * (1 - f) + input[i1]! * f;
  }
  return out;
}

export async function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import("onnxruntime-web").then((mod) => {
      const ort = mod as unknown as OrtModule;
      ort.env.wasm.wasmPaths = ORT_WASM;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      return ort;
    });
  }
  return ortPromise;
}

export async function preferWebGpu(): Promise<boolean> {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export async function createOnnxSession(
  file: File,
  opts?: { wasmOnly?: boolean },
): Promise<{ session: OrtSession; provider: "webgpu" | "wasm" }> {
  const ort = await loadOrt();
  const buf = await file.arrayBuffer();
  if (!opts?.wasmOnly) {
    const gpu = await preferWebGpu();
    if (gpu) {
      try {
        const session = await ort.InferenceSession.create(buf.slice(0), {
          executionProviders: ["webgpu", "wasm"],
        });
        return { session, provider: "webgpu" };
      } catch {
        /* wasm fallback */
      }
    }
  }
  const session = await ort.InferenceSession.create(buf.slice(0), {
    executionProviders: ["wasm"],
  });
  return { session, provider: "wasm" };
}

export function classifySession(session: OrtSession): ConvertKind {
  const inputs = session.inputNames.map((n: string) => n.toLowerCase());
  if (inputs.includes("x_tst") || (inputs.includes("bert") && inputs.includes("style_vec"))) {
    return "sbvits";
  }
  if (
    inputs.some(
      (n: string) => n.includes("phone") || n.includes("hubert") || n === "feats",
    )
  ) {
    return "rvc";
  }
  if (session.inputNames.length === 1) return "audio2audio";
  if (
    inputs.some(
      (n: string) =>
        n.includes("source") || n.includes("audio") || n.includes("wav"),
    )
  ) {
    return "audio2audio";
  }
  return "none";
}

function f0Contour(
  pcm: Float32Array,
  sampleRate: number,
  frames: number,
  pitchSemitones: number,
): Float32Array {
  const shift = Math.pow(2, pitchSemitones / 12);
  const hop = Math.max(1, Math.floor(pcm.length / Math.max(1, frames)));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const start = Math.min(pcm.length - 1, i * hop);
    const end = Math.min(pcm.length, start + Math.max(hop * 2, 256));
    const slice = pcm.subarray(start, end);
    const hit = slice.length >= 64 ? detectPitch(slice, sampleRate) : null;
    const hz = (hit?.hz ?? 0) * shift;
    out[i] = hz > 50 && hz < 1200 ? hz : 0;
  }
  return out;
}

function hzToRvcBin(hz: number) {
  if (hz <= 0) return 1;
  const f0Mel = 1127 * Math.log(1 + hz / 700);
  const min = 1127 * Math.log(1 + 50 / 700);
  const max = 1127 * Math.log(1 + 1100 / 700);
  const bin = 1 + (254 * (f0Mel - min)) / (max - min);
  return Math.max(1, Math.min(255, Math.round(bin)));
}

async function runNamed(
  session: OrtSession,
  feeds: Record<string, unknown>,
): Promise<OrtTensor> {
  const out = await session.run(feeds);
  const first = session.outputNames[0];
  if (!first || !out[first]) {
    throw new Error("ONNX の出力が空です");
  }
  return out[first];
}

function tensorFloat(
  ort: OrtModule,
  data: Float32Array,
  dims: number[],
): unknown {
  return new ort.Tensor("float32", data, dims);
}

export type ContentSnap = {
  frames: number;
  width: number;
  energy: number;
  bars: string;
};

export function contentSnap(
  feat: Float32Array,
  frames: number,
  width: number,
): ContentSnap {
  const f = Math.max(1, frames);
  const w = Math.max(1, width);
  const glyph = "▁▂▃▄▅▆▇█";
  const cols = 16;
  const step = Math.max(1, Math.floor(f / cols));
  const rmsArr: number[] = [];
  let energy = 0;
  for (let b = 0; b < cols; b++) {
    let e = 0;
    let n = 0;
    const a = b * step;
    const z = Math.min(f, a + step);
    for (let i = a; i < z; i++) {
      for (let j = 0; j < w; j++) {
        const v = feat[i * w + j] ?? 0;
        e += v * v;
        n += 1;
      }
    }
    const rms = Math.sqrt(e / Math.max(1, n));
    rmsArr.push(rms);
    energy += rms;
  }
  const peak = Math.max(1e-6, ...rmsArr);
  let bars = "";
  for (const rms of rmsArr) {
    bars += glyph[Math.min(glyph.length - 1, Math.floor((rms / peak) * 7.99))] ?? "▁";
  }
  return { frames: f, width: w, energy, bars };
}

export type ConvertFail = {
  stage: "voice" | "hubert" | "rmvpe" | "assemble";
  file: string;
  kind: ConvertKind | "";
  inputs: string[];
  tried: string;
  reason: string;
  content?: ContentSnap;
};

export function formatConvertFail(f: ConvertFail) {
  const who =
    f.stage === "hubert"
      ? "内容エンコーダ"
      : f.stage === "rmvpe"
        ? "ピッチ抽出"
        : "声モデル";
  const name = f.file || "(無名)";
  const ins = f.inputs.length ? `入力名: ${f.inputs.join(", ")}` : "入力名なし";
  const kind = f.kind && f.kind !== "none" ? `形式 ${f.kind}` : "";
  return [
    `だめなファイル: ${who}「${name}」`,
    kind,
    ins,
    f.tried ? `試した形: ${f.tried}` : "",
    f.reason,
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function convertPcm(opts: {
  pcm: Float32Array;
  sampleRate: number;
  pitch: number;
  voice: OrtSession | null;
  hubert: OrtSession | null;
  rmvpe: OrtSession | null;
  voiceName?: string;
  hubertName?: string;
  rmvpeName?: string;
}): Promise<{ pcm: Float32Array; content?: ContentSnap } | { fail: ConvertFail }> {
  const { pcm, sampleRate, pitch, voice, hubert } = opts;
  if (!voice) {
    return {
      fail: {
        stage: "voice",
        file: opts.voiceName || "",
        kind: "",
        inputs: [],
        tried: "",
        reason: "声モデルが載っていません",
      },
    };
  }
  const ort = await loadOrt();
  const kind = classifySession(voice);
  const vName = opts.voiceName || "声モデル.onnx";
  const hName = opts.hubertName || "内容エンコーダ.onnx";

  if (kind === "sbvits") {
    const { convertSbVits } = await import("./sbvits");
    const out = await convertSbVits(ort, voice, "");
    if ("pcm" in out) {
      return { pcm: resampleLinear(out.pcm, out.rate, sampleRate) };
    }
    return {
      fail: {
        stage: "voice",
        file: vName,
        kind,
        inputs: voice.inputNames,
        tried: out.tried,
        reason: `これは RVC ではなく Style-Bert-VITS2（文章→音声）です。文字起こしを開始して話してください。${out.error}`,
      },
    };
  }

  const pcm16 = resampleLinear(pcm, sampleRate, 16000);

  if (kind === "audio2audio" || (!hubert && kind !== "rvc")) {
    if (kind === "rvc" && !hubert) {
      return {
        fail: {
          stage: "hubert",
          file: hName,
          kind,
          inputs: voice.inputNames,
          tried: "",
          reason: `声モデル「${vName}」は RVC です。AIタブに HuBERT / ContentVec の .onnx が必要です`,
        },
      };
    }
    const name = voice.inputNames[0];
    if (!name) {
      return {
        fail: {
          stage: "voice",
          file: vName,
          kind,
          inputs: [],
          tried: "",
          reason: "入力テンソル名が空です",
        },
      };
    }
    const input = pcm16.length ? pcm16 : pcm;
    const shapes: [number[], string][] = [
      [[1, input.length], `[1, ${input.length}]`],
      [[1, 1, input.length], `[1, 1, ${input.length}]`],
      [[input.length], `[${input.length}]`],
    ];
    let last = "";
    for (const [dims, label] of shapes) {
      try {
        const t = await runNamed(voice, { [name]: tensorFloat(ort, input, dims) });
        const data = t.data as Float32Array;
        return { pcm: resampleLinear(Float32Array.from(data), 16000, sampleRate) };
      } catch (e) {
        last = errText(e);
      }
    }
    return {
      fail: {
        stage: "voice",
        file: vName,
        kind,
        inputs: voice.inputNames,
        tried: shapes.map((s) => `${name} ${s[1]}`).join(" / "),
        reason: last || "単体変換に失敗",
      },
    };
  }

  if (!hubert) {
    return {
      fail: {
        stage: "hubert",
        file: hName,
        kind,
        inputs: voice.inputNames,
        tried: "",
        reason: `声モデル「${vName}」は RVC です。内容エンコーダの .onnx が未設定です`,
      },
    };
  }

  const hubertRun = await runHubert(ort, hubert, pcm16);
  if ("fail" in hubertRun) {
    return {
      fail: {
        ...hubertRun.fail,
        file: opts.hubertName || hubertRun.fail.file,
      },
    };
  }
  const feats = hubertRun.tensor;
  const featData = feats.data as Float32Array;
  const dims = feats.dims ?? [];
  const frames =
    dims.length >= 2 ? Number(dims[dims.length - 2]) : Math.max(1, Math.floor(featData.length / 256));
  const width =
    dims.length >= 1 ? Number(dims[dims.length - 1]) : Math.floor(featData.length / frames);
  const content = contentSnap(featData, Math.max(1, frames), Math.max(1, width));
  const f0 = f0Contour(pcm16, 16000, Math.max(1, frames), pitch);
  const feeds: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const raw of voice.inputNames) {
    const n = raw.toLowerCase();
    if (n.includes("phone") || n.includes("feat") || n.includes("hubert") || n.includes("content")) {
      feeds[raw] = tensorFloat(ort, featData, [1, frames, width]);
    } else if (n === "pitchf" || (n.includes("f0") && !n.includes("coarse"))) {
      feeds[raw] = tensorFloat(ort, f0, [1, f0.length]);
    } else if (n === "pitch" || n.includes("pitch") || n.includes("coarse")) {
      const bins = new BigInt64Array(f0.length);
      for (let i = 0; i < f0.length; i++) bins[i] = BigInt(hzToRvcBin(f0[i]!));
      feeds[raw] = new ort.Tensor("int64", bins, [1, f0.length]);
    } else if (n.includes("sid") || n === "ds" || n.includes("speaker")) {
      feeds[raw] = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
    } else if (n.includes("rnd") || n.includes("noise") || n.includes("rand")) {
      const rnd = new Float32Array(f0.length);
      for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random() * 2 - 1;
      feeds[raw] = tensorFloat(ort, rnd, [1, 1, rnd.length]);
    } else if (n.includes("len")) {
      feeds[raw] = new ort.Tensor("int64", BigInt64Array.from([BigInt(frames)]), [1]);
    } else {
      missing.push(raw);
    }
  }
  if (!Object.keys(feeds).length) {
    return {
      fail: {
        stage: "voice",
        file: vName,
        kind,
        inputs: voice.inputNames,
        tried: `HuBERT出力 [1, ${frames}, ${width}]`,
        reason: "声モデルの入力名（phone / pitch など）に割り当てられませんでした",
        content,
      },
    };
  }
  try {
    const t = await runNamed(voice, feeds);
    const data = t.data as Float32Array;
    const outRate = data.length > pcm16.length * 1.5 ? 40000 : 16000;
    return {
      pcm: resampleLinear(Float32Array.from(data), outRate, sampleRate),
      content,
    };
  } catch (e) {
    return {
      fail: {
        stage: "voice",
        file: vName,
        kind,
        inputs: voice.inputNames,
        tried: `phone/feats [1, ${frames}, ${width}]${missing.length ? ` · 未割り当て: ${missing.join(", ")}` : ""}`,
        reason: errText(e),
        content,
      },
    };
  }
}

function errText(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  return s.replace(/\s+/g, " ").slice(0, 180) || "エラー詳細なし";
}

async function runHubert(
  ort: OrtModule,
  hubert: OrtSession,
  pcm16: Float32Array,
): Promise<{ tensor: OrtTensor } | { fail: ConvertFail }> {
  const names = hubert.inputNames;
  const attempts: { label: string; feeds: () => Record<string, unknown> }[] = [
    {
      label: names.map((n) => `${n} [1, ${pcm16.length}]`).join(" + "),
      feeds: () => {
        const feeds: Record<string, unknown> = {};
        for (const n of names) {
          const k = n.toLowerCase();
          if (k.includes("mask") || k.includes("pad")) {
            feeds[n] = new ort.Tensor("bool", new Uint8Array(pcm16.length), [1, pcm16.length]);
          } else {
            feeds[n] = tensorFloat(ort, pcm16, [1, pcm16.length]);
          }
        }
        return feeds;
      },
    },
    {
      label: `${names[0] ?? "input"} [1, ${pcm16.length}]`,
      feeds: () => ({ [names[0]!]: tensorFloat(ort, pcm16, [1, pcm16.length]) }),
    },
    {
      label: `${names[0] ?? "input"} [1, 1, ${pcm16.length}]`,
      feeds: () => ({ [names[0]!]: tensorFloat(ort, pcm16, [1, 1, pcm16.length]) }),
    },
  ];
  let last = "";
  for (const a of attempts) {
    if (!names[0] && a !== attempts[0]) continue;
    try {
      const t = await runNamed(hubert, a.feeds());
      return { tensor: t };
    } catch (e) {
      last = errText(e);
    }
  }
  return {
    fail: {
      stage: "hubert",
      file: "内容エンコーダ.onnx",
      kind: "none",
      inputs: names,
      tried: attempts.map((a) => a.label).join(" / "),
      reason: last || "HuBERT 推論に失敗",
    },
  };
}
