import type { OrtModule, OrtSession } from "./ai-infer";
import { consumeUtterance, peekUtterance } from "./live-transcript";

const ZH = [
  "E","En","a","ai","an","ang","ao","b","c","ch","d","e","ei","en","eng","er",
  "f","g","h","i","i0","ia","ian","iang","iao","ie","in","ing","iong","ir","iu",
  "j","k","l","m","n","o","ong","ou","p","q","r","s","sh","t","u","ua","uai",
  "uan","uang","ui","un","uo","v","van","ve","vn","w","x","y","z","zh","AA","EE","OO",
];
const JP = [
  "N","a","a:","b","by","ch","d","dy","e","e:","f","g","gy","h","hy","i","i:",
  "j","k","ky","m","my","n","ny","o","o:","p","py","q","r","ry","s","sh","t",
  "ts","ty","u","u:","w","y","z","zy",
];
const EN = [
  "aa","ae","ah","ao","aw","ay","b","ch","d","dh","eh","er","ey","f","g","hh",
  "ih","iy","jh","k","l","m","n","ng","ow","oy","p","r","s","sh","t","th","uh",
  "uw","V","w","y","z","zh",
];
const PUNCT = ["!", "?", "…", ",", ".", "'", "-", "SP", "UNK"];
export const SBV_SYMBOLS = ["_", ...[...new Set([...ZH, ...JP, ...EN])].sort(), ...PUNCT];
const UNK = SBV_SYMBOLS.indexOf("UNK");
const JP_LANG = 1;
const JP_TONE0 = 6;

const MORA: Record<string, string[]> = {
  あ: ["a"], い: ["i"], う: ["u"], え: ["e"], お: ["o"],
  ぁ: ["a"], ぃ: ["i"], ぅ: ["u"], ぇ: ["e"], ぉ: ["o"],
  か: ["k","a"], き: ["k","i"], く: ["k","u"], け: ["k","e"], こ: ["k","o"],
  が: ["g","a"], ぎ: ["g","i"], ぐ: ["g","u"], げ: ["g","e"], ご: ["g","o"],
  さ: ["s","a"], し: ["sh","i"], す: ["s","u"], せ: ["s","e"], そ: ["s","o"],
  ざ: ["z","a"], じ: ["j","i"], ず: ["z","u"], ぜ: ["z","e"], ぞ: ["z","o"],
  た: ["t","a"], ち: ["ch","i"], つ: ["ts","u"], て: ["t","e"], と: ["t","o"],
  だ: ["d","a"], ぢ: ["j","i"], づ: ["z","u"], で: ["d","e"], ど: ["d","o"],
  な: ["n","a"], に: ["n","i"], ぬ: ["n","u"], ね: ["n","e"], の: ["n","o"],
  は: ["h","a"], ひ: ["h","i"], ふ: ["f","u"], へ: ["h","e"], ほ: ["h","o"],
  ば: ["b","a"], び: ["b","i"], ぶ: ["b","u"], べ: ["b","e"], ぼ: ["b","o"],
  ぱ: ["p","a"], ぴ: ["p","i"], ぷ: ["p","u"], ぺ: ["p","e"], ぽ: ["p","o"],
  ま: ["m","a"], み: ["m","i"], む: ["m","u"], め: ["m","e"], も: ["m","o"],
  や: ["y","a"], ゆ: ["y","u"], よ: ["y","o"], ゃ: ["y","a"], ゅ: ["y","u"], ょ: ["y","o"],
  ら: ["r","a"], り: ["r","i"], る: ["r","u"], れ: ["r","e"], ろ: ["r","o"],
  わ: ["w","a"], を: ["o"], ん: ["N"], っ: ["q"], ゔ: ["v","u"],
  きゃ: ["ky","a"], きゅ: ["ky","u"], きょ: ["ky","o"],
  ぎゃ: ["gy","a"], ぎゅ: ["gy","u"], ぎょ: ["gy","o"],
  しゃ: ["sh","a"], しゅ: ["sh","u"], しょ: ["sh","o"],
  じゃ: ["j","a"], じゅ: ["j","u"], じょ: ["j","o"],
  ちゃ: ["ch","a"], ちゅ: ["ch","u"], ちょ: ["ch","o"],
  にゃ: ["ny","a"], にゅ: ["ny","u"], にょ: ["ny","o"],
  ひゃ: ["hy","a"], ひゅ: ["hy","u"], ひょ: ["hy","o"],
  びゃ: ["by","a"], びゅ: ["by","u"], びょ: ["by","o"],
  ぴゃ: ["py","a"], ぴゅ: ["py","u"], ぴょ: ["py","o"],
  みゃ: ["my","a"], みゅ: ["my","u"], みょ: ["my","o"],
  りゃ: ["ry","a"], りゅ: ["ry","u"], りょ: ["ry","o"],
};

const HIRA = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ";
const KATA = "ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ";

function toHira(s: string) {
  return s.replace(/[ァ-ンヴ]/g, (c) => {
    const i = KATA.indexOf(c);
    return i >= 0 ? HIRA[i]! : c;
  });
}

export function textToPhones(text: string): string[] {
  const src = toHira(text.normalize("NFKC")).replace(/\s+/g, "");
  const phones: string[] = ["_"];
  for (let i = 0; i < src.length; i++) {
    const tri = src.slice(i, i + 2);
    if (MORA[tri]) {
      phones.push(...MORA[tri]!);
      i += 1;
      continue;
    }
    const ch = src[i]!;
    if (ch === "ー" && phones.length) {
      const last = phones[phones.length - 1]!;
      if (/^[aeiou]$/.test(last)) phones[phones.length - 1] = `${last}:`;
      continue;
    }
    if (MORA[ch]) phones.push(...MORA[ch]!);
    else if (/[!,.?…]/.test(ch)) phones.push(ch === "。" || ch === "." ? "." : ch === "、" || ch === "," ? "," : ch);
  }
  phones.push("_");
  return phones.length > 2 ? phones : ["_", "a", "_"];
}

export function phonesToIds(phones: string[]): Int32Array {
  const ids = new Int32Array(phones.length);
  for (let i = 0; i < phones.length; i++) {
    const n = SBV_SYMBOLS.indexOf(phones[i]!);
    ids[i] = n >= 0 ? n : UNK;
  }
  return ids;
}

export function isSbVitsSession(session: OrtSession) {
  const n = session.inputNames.map((s) => s.toLowerCase());
  return n.includes("x_tst") && n.some((s) => s.includes("bert") || s.includes("style"));
}

function i32(ort: OrtModule, data: Int32Array, dims: number[]) {
  return new ort.Tensor("int32", data, dims);
}
function i64(ort: OrtModule, data: Int32Array, dims: number[]) {
  const big = new BigInt64Array(data.length);
  for (let i = 0; i < data.length; i++) big[i] = BigInt(data[i]!);
  return new ort.Tensor("int64", big, dims);
}
function f32(ort: OrtModule, data: Float32Array, dims: number[]) {
  return new ort.Tensor("float32", data, dims);
}

function wantsInt32(msg: string) {
  return /expected:\s*\(?tensor\(int32\)/i.test(msg);
}
function wantsInt64(msg: string) {
  return /expected:\s*\(?tensor\(int64\)/i.test(msg);
}

async function runNamed(session: OrtSession, feeds: Record<string, unknown>) {
  const out = await session.run(feeds);
  const first = session.outputNames[0] && out[session.outputNames[0]];
  if (first) return first;
  const keys = Object.keys(out);
  if (!keys[0]) throw new Error("出力なし");
  return out[keys[0]]!;
}

type IntKind = "int64" | "int32";

function buildFeeds(
  ort: OrtModule,
  names: readonly string[],
  intKind: IntKind,
  ids: Int32Array,
  tones: Int32Array,
  lang: Int32Array,
  t: number,
  bshape: number[],
  sshape: number[],
  sc: number[],
) {
  const im = intKind === "int64" ? i64 : i32;
  const scDims = sc.length ? sc : [1];
  const feeds: Record<string, unknown> = {};
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (n === "x_tst") feeds[raw] = im(ort, ids, [1, t]);
    else if (n === "x_tst_lengths" || (n.includes("tst") && n.includes("len"))) {
      feeds[raw] = im(ort, Int32Array.from([t]), [1]);
    } else if (n === "sid" || n === "speaker") feeds[raw] = im(ort, Int32Array.from([0]), [1]);
    else if (n.includes("tone")) feeds[raw] = im(ort, tones, [1, t]);
    else if (n.includes("lang")) feeds[raw] = im(ort, lang, [1, t]);
    else if (n.includes("bert")) {
      const size = bshape.reduce((a, b) => a * Math.max(1, b), 1);
      feeds[raw] = f32(ort, new Float32Array(size), bshape);
    } else if (n.includes("style")) {
      const size = sshape.reduce((a, b) => a * Math.max(1, b), 1);
      feeds[raw] = f32(ort, new Float32Array(size), sshape);
    } else if (n.includes("sdp")) feeds[raw] = f32(ort, Float32Array.from([0.2]), scDims);
    else if (n.includes("length")) feeds[raw] = f32(ort, Float32Array.from([1.35]), scDims);
    else if (n.includes("noise") && n.includes("w")) {
      feeds[raw] = f32(ort, Float32Array.from([0.5]), scDims);
    } else if (n.includes("noise")) {
      feeds[raw] = f32(ort, Float32Array.from([0.35]), scDims);
    }
  }
  return feeds;
}

function guessTtsRate(samples: number, phoneCount: number) {
  const mora = Math.max(2, Math.round(phoneCount * 0.55));
  const want = mora * 0.22;
  const rates = [22050, 24000, 32000, 44100, 48000];
  let best = 44100;
  let err = Infinity;
  for (const r of rates) {
    const d = Math.abs(samples / r - want);
    if (d < err) {
      err = d;
      best = r;
    }
  }
  return best;
}

function easeEdges(pcm: Float32Array, sr: number) {
  const n = Math.min(pcm.length, Math.floor(sr * 0.02));
  if (n < 8) return pcm;
  for (let i = 0; i < n; i++) {
    const g = i / n;
    pcm[i]! *= g;
    pcm[pcm.length - 1 - i]! *= g;
  }
  return pcm;
}

let cached:
  | { intKind: IntKind; bshape: number[]; sshape: number[]; sc: number[] }
  | null = null;

export async function convertSbVits(
  ort: OrtModule,
  voice: OrtSession,
  text: string,
): Promise<
  | { pcm: Float32Array; rate: number; used: string }
  | { skip: true }
  | { error: string; tried: string }
> {
  const spoken = (text || peekUtterance()).trim().slice(0, 80);
  if (spoken.length < 2) return { skip: true };
  const phones = textToPhones(spoken);
  const ids = phonesToIds(phones);
  const t = ids.length;
  const tones = new Int32Array(t).fill(JP_TONE0);
  const lang = new Int32Array(t).fill(JP_LANG);
  const names = voice.inputNames;
  const bertShapes: number[][] = [
    [1, 1024, t],
    [1, t, 1024],
    [1024, t],
    [1, 768, t],
    [1, t, 768],
  ];
  const styleShapes: number[][] = [[1, 256], [256], [1, 128], [1, 512]];
  const scalarShapes: number[][] = [[1], []];
  let intKind: IntKind = cached?.intKind ?? "int64";
  const tried: string[] = [];
  let last = "";

  const combos: { intKind: IntKind; bshape: number[]; sshape: number[]; sc: number[] }[] = [];
  if (cached) combos.push(cached);
  for (const bshape of bertShapes) {
    for (const sshape of styleShapes) {
      for (const sc of scalarShapes) {
        combos.push({ intKind, bshape, sshape, sc });
      }
    }
  }

  for (const combo of combos) {
    const label = `${combo.intKind} bert${combo.bshape.join("x")} style${combo.sshape.join("x")} 「${spoken}」`;
    tried.push(label);
    try {
      const feeds = buildFeeds(
        ort,
        names,
        combo.intKind,
        ids,
        tones,
        lang,
        t,
        combo.bshape,
        combo.sshape,
        combo.sc,
      );
      const out = await runNamed(voice, feeds);
      const data = out.data as Float32Array;
      if (!data?.length) throw new Error("無音出力");
      cached = combo;
      consumeUtterance(spoken);
      const pcm = easeEdges(Float32Array.from(data), guessTtsRate(data.length, t));
      return { pcm, rate: guessTtsRate(data.length, t), used: label };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (combo.intKind === "int64" && wantsInt32(last)) intKind = "int32";
      if (combo.intKind === "int32" && wantsInt64(last)) intKind = "int64";
    }
  }

  if (intKind !== (cached?.intKind ?? "int64")) {
    for (const bshape of bertShapes) {
      for (const sshape of styleShapes) {
        for (const sc of scalarShapes) {
          const label = `${intKind} bert${bshape.join("x")} style${sshape.join("x")} 「${spoken}」`;
          tried.push(label);
          try {
            const feeds = buildFeeds(ort, names, intKind, ids, tones, lang, t, bshape, sshape, sc);
            const out = await runNamed(voice, feeds);
            const data = out.data as Float32Array;
            if (!data?.length) throw new Error("無音出力");
            cached = { intKind, bshape, sshape, sc };
            consumeUtterance(spoken);
            const rate = guessTtsRate(data.length, t);
            return { pcm: easeEdges(Float32Array.from(data), rate), rate, used: label };
          } catch (e) {
            last = e instanceof Error ? e.message : String(e);
          }
        }
      }
    }
  }

  return {
    error: last.replace(/\s+/g, " ").slice(0, 220) || "Style-Bert-VITS2 の推論に失敗",
    tried: tried.slice(0, 8).join(" / "),
  };
}

