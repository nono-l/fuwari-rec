import { detectPitch } from "./pitch";

type OrtTensor = {
  data: Float32Array | BigInt64Array | number[];
  dims?: number[];
};

export type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

type OrtModule = {
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

export type ConvertKind = "audio2audio" | "rvc" | "none";

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
): Promise<{ session: OrtSession; provider: "webgpu" | "wasm" }> {
  const ort = await loadOrt();
  const buf = await file.arrayBuffer();
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
  const session = await ort.InferenceSession.create(buf.slice(0), {
    executionProviders: ["wasm"],
  });
  return { session, provider: "wasm" };
}

export function classifySession(session: OrtSession): ConvertKind {
  const inputs = session.inputNames.map((n: string) => n.toLowerCase());
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

export async function convertPcm(opts: {
  pcm: Float32Array;
  sampleRate: number;
  pitch: number;
  voice: OrtSession | null;
  hubert: OrtSession | null;
  rmvpe: OrtSession | null;
}): Promise<Float32Array | null> {
  const { pcm, sampleRate, pitch, voice, hubert } = opts;
  if (!voice) return null;
  const ort = await loadOrt();
  const kind = classifySession(voice);
  const pcm16 = resampleLinear(pcm, sampleRate, 16000);

  if (kind === "audio2audio" || (!hubert && kind !== "rvc")) {
    const name = voice.inputNames[0];
    if (!name) return null;
    const input = pcm16.length ? pcm16 : pcm;
    try {
      const t = await runNamed(voice, {
        [name]: tensorFloat(ort, input, [1, input.length]),
      });
      const data = t.data as Float32Array;
      return resampleLinear(Float32Array.from(data), 16000, sampleRate);
    } catch {
      try {
        const t = await runNamed(voice, {
          [name]: tensorFloat(ort, input, [1, 1, input.length]),
        });
        const data = t.data as Float32Array;
        return resampleLinear(Float32Array.from(data), 16000, sampleRate);
      } catch {
        return null;
      }
    }
  }

  if (!hubert) return null;
  const hName = hubert.inputNames[0];
  if (!hName) return null;
  let feats: OrtTensor;
  try {
    feats = await runNamed(hubert, {
      [hName]: tensorFloat(ort, pcm16, [1, pcm16.length]),
    });
  } catch {
    return null;
  }
  const featData = feats.data as Float32Array;
  const dims = feats.dims ?? [];
  const frames =
    dims.length >= 2 ? Number(dims[dims.length - 2]) : Math.max(1, Math.floor(featData.length / 256));
  const width =
    dims.length >= 1 ? Number(dims[dims.length - 1]) : Math.floor(featData.length / frames);
  const f0 = f0Contour(pcm16, 16000, Math.max(1, frames), pitch);
  const feeds: Record<string, unknown> = {};
  for (const raw of voice.inputNames) {
    const n = raw.toLowerCase();
    if (n.includes("phone") || n.includes("feat") || n.includes("hubert") || n.includes("content")) {
      feeds[raw] = tensorFloat(ort, featData, [1, frames, width]);
    } else if (n === "pitchf" || n.includes("f0") && !n.includes("coarse")) {
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
    }
  }
  if (!Object.keys(feeds).length) return null;
  try {
    const t = await runNamed(voice, feeds);
    const data = t.data as Float32Array;
    const outRate = data.length > pcm16.length * 1.5 ? 40000 : 16000;
    return resampleLinear(Float32Array.from(data), outRate, sampleRate);
  } catch {
    return null;
  }
}
