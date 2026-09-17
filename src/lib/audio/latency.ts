import { normalizeOffsetTune, normalizePitchTune, type SpectrumFilter } from "./spectrum-filters";
import { normalizeLimiterTune, type ObsInsert } from "./obs-filters";
import type { AiVoiceInsert } from "./ai-voice";

export type LatencyPart = {
  id: string;
  label: string;
  ms: number;
};

export const AI_HOP_SAMPLES = 4096;
export const OUTPUT_SAFE_LOOKAHEAD_MS = 3;

export function hopMs(sampleRate: number) {
  return (AI_HOP_SAMPLES / Math.max(8000, sampleRate)) * 1000;
}

export function grainMs(grain: number, sampleRate: number) {
  return (grain / Math.max(8000, sampleRate)) * 1000;
}

/** WASM vs WebGPU の推論差の目安。実測があればそれを優先。 */
export function inferGuess(provider: "" | "webgpu" | "wasm", measuredMs: number) {
  if (measuredMs > 1) {
    if (provider === "webgpu") {
      return { now: measuredMs, other: measuredMs * 2.2, otherLabel: "WASM" as const };
    }
    return { now: measuredMs, other: Math.max(12, measuredMs * 0.4), otherLabel: "WebGPU" as const };
  }
  if (provider === "webgpu") {
    return { now: 22, other: 70, otherLabel: "WASM" as const };
  }
  return { now: 70, other: 22, otherLabel: "WebGPU" as const };
}

export function partsFromChain(
  filters: SpectrumFilter[],
  inserts: ObsInsert[],
  ai: AiVoiceInsert | null,
  opts: {
    sampleRate: number;
    inferMs: number;
    provider: "" | "webgpu" | "wasm";
    outputSafe: boolean;
  },
): LatencyPart[] {
  const sr = opts.sampleRate || 48000;
  const parts: LatencyPart[] = [];
  for (const f of filters) {
    if (!f.enabled) continue;
    if (f.kind === "band-offset") {
      const t = normalizeOffsetTune(f.offset).timeMs;
      if (t > 0.5 && (f.gain ?? 0) > 0.05) {
        parts.push({ id: `off-${f.id}`, label: "オフセット", ms: t });
      }
    }
    if (f.kind === "band-pitch") {
      const p = normalizePitchTune(f.pitch);
      const shifting = Math.abs(f.gain) >= 0.05 || Math.abs(p.cents) >= 2;
      if (shifting && p.mix > 0.05) {
        parts.push({
          id: `pit-${f.id}`,
          label: "粒ピッチ",
          ms: grainMs(p.grain, sr),
        });
      }
    }
  }
  for (const ins of inserts) {
    if (!ins.enabled || ins.kind !== "limiter") continue;
    const l = normalizeLimiterTune(ins.limiter, ins.amount);
    if (l.mix > 0.05 && l.lookaheadMs > 0.2) {
      parts.push({
        id: `lim-${ins.id}`,
        label: "リミッター先読み",
        ms: l.lookaheadMs,
      });
    }
  }
  if (ai?.enabled) {
    const hop = hopMs(sr);
    const inf = ai.modelBytes > 0 ? inferGuess(opts.provider, opts.inferMs).now : 0;
    parts.push({ id: "ai-hop", label: "AI待ち", ms: hop });
    if (inf > 0.5) {
      parts.push({
        id: "ai-inf",
        label: opts.provider === "webgpu" ? "AI推論 (WebGPU)" : "AI推論 (WASM)",
        ms: inf,
      });
    }
  }
  if (opts.outputSafe) {
    parts.push({
      id: "safe",
      label: "出力セーフ",
      ms: OUTPUT_SAFE_LOOKAHEAD_MS,
    });
  }
  return parts;
}

export function sumMs(parts: LatencyPart[]) {
  return parts.reduce((n, p) => n + p.ms, 0);
}

export function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0.05) return "0 ms";
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}
