import { loadOrt, isOnnxFile, type OrtSession } from "./ai-infer";
import { loadAiRuntimeFile, type AiRuntimeSlotId } from "./ai-runtime";
import { formatModelSize } from "./ai-voice";

export type ModelRole =
  | "hubert"
  | "rmvpe"
  | "rvc"
  | "audio2audio"
  | "pretrained"
  | "pytorch"
  | "unknown";

export type ModelInspect = {
  name: string;
  bytes: number;
  format: "onnx" | "pytorch" | "unknown";
  role: ModelRole;
  ok: boolean;
  fit: "ok" | "wrong-slot" | "bad-format" | "broken" | "empty";
  inputs: string[];
  outputs: string[];
  detail: string;
};

const ROLE_JA: Record<ModelRole, string> = {
  hubert: "内容エンコーダ（HuBERT / ContentVec）",
  rmvpe: "ピッチ抽出（RMVPE など）",
  rvc: "声モデル（RVC）",
  audio2audio: "音声→音声の変換モデル",
  pretrained: "学習の初期重み",
  pytorch: "PyTorch 学習用",
  unknown: "判別できないモデル",
};

export function roleLabel(role: ModelRole) {
  return ROLE_JA[role];
}

export function expectedRole(slot: AiRuntimeSlotId | "voice"): ModelRole {
  if (slot === "hubert") return "hubert";
  if (slot === "rmvpe") return "rmvpe";
  if (slot === "pretrained") return "pretrained";
  return "rvc";
}

async function sniffFormat(file: File): Promise<ModelInspect["format"]> {
  if (isOnnxFile(file)) return "onnx";
  if (/\.(pt|pth)$/i.test(file.name)) return "pytorch";
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) return "pytorch";
  } catch {
    /* ignore */
  }
  return "unknown";
}

function classifyRole(session: OrtSession, filename: string): ModelRole {
  const ins = session.inputNames.map((n) => n.toLowerCase());
  const outs = session.outputNames.map((n) => n.toLowerCase());
  const fn = filename.toLowerCase();
  if (fn.includes("hubert") || fn.includes("contentvec")) return "hubert";
  if (fn.includes("rmvpe") || fn.includes("fcpe") || fn.includes("crepe")) return "rmvpe";
  if (
    ins.some(
      (n) =>
        n.includes("phone") ||
        n === "feats" ||
        n.includes("pitchf"),
    )
  ) {
    return "rvc";
  }
  if (
    ins.some(
      (n) =>
        n.includes("x_tst") ||
        n.includes("style_vec") ||
        (n.includes("bert") && ins.includes("tones")),
    )
  ) {
    return "audio2audio";
  }
  if (outs.some((n) => n.includes("f0") || n.includes("pitch")) && ins.length <= 2) {
    return "rmvpe";
  }
  if (ins.length === 1) {
    if (outs.some((n) => n.includes("hidden") || n.includes("feat") || n.includes("unit"))) {
      return "hubert";
    }
    if (ins[0].includes("source") || ins[0].includes("wav") || ins[0].includes("audio")) {
      return "audio2audio";
    }
    return "audio2audio";
  }
  return "unknown";
}

function fitOf(
  slot: AiRuntimeSlotId | "voice",
  format: ModelInspect["format"],
  role: ModelRole,
): ModelInspect["fit"] {
  if (format === "pytorch") return slot === "pretrained" ? "ok" : "bad-format";
  if (format !== "onnx") return "bad-format";
  if (slot === "voice") {
    return role === "rvc" || role === "audio2audio" ? "ok" : "wrong-slot";
  }
  if (slot === "pretrained") return "bad-format";
  if (role === expectedRole(slot)) return "ok";
  if (role === "unknown") return "ok";
  return "wrong-slot";
}

function detailOf(inspect: Omit<ModelInspect, "detail">): string {
  const size = formatModelSize(inspect.bytes);
  const who = roleLabel(inspect.role);
  if (inspect.fit === "empty") return "ファイルがありません";
  if (inspect.format === "pytorch") {
    return `${inspect.name}${size ? `（${size}）` : ""} は .pt / .pth です。学習用で、ブラウザの変換には使えません。.onnx を選んでください`;
  }
  if (inspect.fit === "broken") {
    return `${inspect.name} は ONNX として開けません。壊れているか、このブラウザでは読めません`;
  }
  if (inspect.fit === "wrong-slot") {
    return `${inspect.name} は「${who}」です。置き場所が違います`;
  }
  const ports = inspect.inputs.length
    ? `入力 ${inspect.inputs.join(", ")}`
    : "入力名なし";
  return `${inspect.name}${size ? ` ${size}` : ""} · ${who} · ${ports}。この欄で使えます`;
}

export async function inspectModelFile(
  file: File | null,
  slot: AiRuntimeSlotId | "voice",
): Promise<ModelInspect> {
  if (!file) {
    const empty: ModelInspect = {
      name: "",
      bytes: 0,
      format: "unknown",
      role: "unknown",
      ok: false,
      fit: "empty",
      inputs: [],
      outputs: [],
      detail: "",
    };
    return { ...empty, detail: detailOf(empty) };
  }
  const format = await sniffFormat(file);
  if (format !== "onnx") {
    const base = {
      name: file.name,
      bytes: file.size,
      format,
      role: (slot === "pretrained" ? "pretrained" : "pytorch") as ModelRole,
      ok: slot === "pretrained" && format === "pytorch",
      fit: fitOf(slot, format, "pytorch"),
      inputs: [] as string[],
      outputs: [] as string[],
    };
    return { ...base, detail: detailOf(base) };
  }
  try {
    const ort = await loadOrt();
    const buf = await file.arrayBuffer();
    const session = await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
    });
    const role = classifyRole(session, file.name);
    const fit = fitOf(slot, "onnx", role);
    const base = {
      name: file.name,
      bytes: file.size,
      format: "onnx" as const,
      role,
      ok: fit === "ok",
      fit,
      inputs: [...session.inputNames],
      outputs: [...session.outputNames],
    };
    return { ...base, detail: detailOf(base) };
  } catch (e) {
    console.error(e);
    const base = {
      name: file.name,
      bytes: file.size,
      format: "onnx" as const,
      role: "unknown" as const,
      ok: false,
      fit: "broken" as const,
      inputs: [] as string[],
      outputs: [] as string[],
    };
    return { ...base, detail: detailOf(base) };
  }
}

export async function inspectRuntimeSlot(id: AiRuntimeSlotId): Promise<ModelInspect> {
  const file = await loadAiRuntimeFile(id);
  return inspectModelFile(file, id);
}

export type SetupCheck = {
  items: { slot: AiRuntimeSlotId | "voice"; inspect: ModelInspect }[];
  summary: string;
  ok: boolean;
};

export async function inspectAiSetup(voiceFile: File | null): Promise<SetupCheck> {
  const hubert = await inspectRuntimeSlot("hubert");
  const rmvpe = await inspectRuntimeSlot("rmvpe");
  const pretrained = await inspectRuntimeSlot("pretrained");
  const voice = await inspectModelFile(voiceFile, "voice");
  const items: SetupCheck["items"] = [
    { slot: "hubert", inspect: hubert },
    { slot: "rmvpe", inspect: rmvpe },
    { slot: "pretrained", inspect: pretrained },
    { slot: "voice", inspect: voice },
  ];
  const convertReady = voice.ok && (voice.role === "audio2audio" || hubert.ok);
  let summary: string;
  if (voice.fit === "empty" && hubert.fit === "empty" && rmvpe.fit === "empty") {
    summary = "まだファイルがありません。変換しなくても内蔵の声色は使えます";
  } else if (convertReady) {
    summary = voice.role === "rvc"
      ? hubert.ok
        ? "声モデルと内容エンコーダが揃っています。エフェクト ON で変換します"
        : "声モデルは RVC です。内容エンコーダ（HuBERT の .onnx）が必要です"
      : "声モデルは単体で変換できる形式です";
  } else if (voice.fit === "empty") {
    summary = "土台の判定は下に出ます。声色そのものはエフェクターの AIボイスで .onnx を選んでください";
  } else {
    summary = "変換できる組み合わせになっていません。下の判定を直してください";
  }
  const ok = items.some((i) => i.inspect.ok) && (voice.ok || voice.fit === "empty");
  return { items, summary, ok: convertReady || (voice.fit === "empty" && hubert.ok) };
}
