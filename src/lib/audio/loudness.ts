export type LufsTargetId = "stream" | "music" | "talk";

export type LufsTarget = {
  id: LufsTargetId;
  label: string;
  lufs: number;
  hint: string;
};

export const LUFS_TARGETS: LufsTarget[] = [
  {
    id: "stream",
    label: "配信 −14",
    lufs: -14,
    hint: "YouTube / Twitch の目安",
  },
  {
    id: "music",
    label: "音楽 −16",
    lufs: -16,
    hint: "曲として少し余裕を残す",
  },
  {
    id: "talk",
    label: "通話 −18",
    lufs: -18,
    hint: "Discord など会話向け",
  },
];

export const DEFAULT_OUTPUT_CEILING_DB = -1;

export type LoudnessReading = {
  momentary: number;
  shortTerm: number;
  truePeakDb: number;
};

export function dbToLin(db: number) {
  return Math.pow(10, db / 20);
}

export function linToDb(lin: number) {
  if (lin <= 1e-8) return -80;
  return 20 * Math.log10(lin);
}

export function meanSquareToLufs(ms: number) {
  if (ms <= 1e-12) return -70;
  return -0.691 + 10 * Math.log10(ms);
}

/** 4-point linear upsample peak (true-peak estimate). */
export function truePeakLin(buf: Float32Array) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = buf[i]!;
    const aa = a < 0 ? -a : a;
    if (aa > p) p = aa;
    if (i + 1 < buf.length) {
      const b = buf[i + 1]!;
      const m1 = (a * 3 + b) * 0.25;
      const m2 = (a + b) * 0.5;
      const m3 = (a + b * 3) * 0.25;
      const x1 = m1 < 0 ? -m1 : m1;
      const x2 = m2 < 0 ? -m2 : m2;
      const x3 = m3 < 0 ? -m3 : m3;
      if (x1 > p) p = x1;
      if (x2 > p) p = x2;
      if (x3 > p) p = x3;
    }
  }
  return p;
}

export function formatLufs(n: number) {
  if (!Number.isFinite(n) || n <= -69) return "—";
  return `${n.toFixed(1)} LUFS`;
}

export function formatTp(n: number) {
  if (!Number.isFinite(n) || n <= -69) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} dBTP`;
}

export function lufsDelta(reading: number, target: number) {
  if (!Number.isFinite(reading) || reading <= -69) return 0;
  return reading - target;
}
