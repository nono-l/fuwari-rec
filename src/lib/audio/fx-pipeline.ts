import type { SpectrumFilter } from "./spectrum-filters";
import type { ObsInsert } from "./obs-filters";
import type { LiveSlot, ProcessHold } from "./live-fx";
import type { AiVoiceInsert } from "./ai-voice";
import type { CableInsert } from "./cables";
import type { DeviceIoInsert } from "./device-io";
import { asCableIndex, type CableIndex } from "./cables";

/** @deprecated Audio always runs in parallel; kept for saved state. */
export type PipelineVia = "main" | "2" | "3" | "both";

export type ExtraPipeline = {
  id: string;
  name: string;
  enabled: boolean;
  number: number;
  inputCable: CableIndex;
  outputCable: CableIndex;
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  cableInserts: CableInsert[];
  deviceInserts: DeviceIoInsert[];
  aiVoice: AiVoiceInsert | null;
  liveChain: LiveSlot[];
  fxSoloId?: string | null;
  abHold?: ProcessHold | null;
};

export const MAX_PIPELINES = 7;
export const PIPELINE_OVERHEAD = 3;
export const CPU_UNIT_PER_CORE = 10;

export function cpuCores(): number {
  if (typeof navigator === "undefined") return 4;
  const n = Math.round(Number(navigator.hardwareConcurrency) || 0);
  return Math.max(1, Math.min(32, n || 4));
}

/** Extra pipelines besides P1. At least 1, at most 6, leave one core for UI. */
export function extraPipelineBudget(): number {
  return Math.max(1, Math.min(MAX_PIPELINES - 1, cpuCores() - 1));
}

export function cpuLoadBudget(): number {
  return Math.max(20, cpuCores() * CPU_UNIT_PER_CORE);
}

export function stageCost(kind: string): number {
  switch (kind) {
    case "band-pitch":
      return 8;
    case "band-reverb":
      return 6;
    case "band-delay":
      return 3;
    case "band-offset":
      return 2;
    case "ai":
      return 6;
    case "band-formant":
      return 4;
    case "compressor":
    case "upward":
    case "expander":
    case "limiter":
    case "denoise":
    case "gate":
    case "howl":
      return 4;
    case "eq3":
      return 2;
    default:
      return 1;
  }
}

export type CpuLoadSlice = {
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
  extraPipelines?: ExtraPipeline[];
};

export function chainLoad(p: {
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
}): number {
  let n = 0;
  for (const f of p.spectrumFilters) {
    if (f.enabled) n += stageCost(f.kind);
  }
  for (const f of p.obsInserts) {
    if (f.enabled) n += stageCost(f.kind);
  }
  if (p.aiVoice?.enabled) n += stageCost("ai");
  return n;
}

export function sessionLoad(s: CpuLoadSlice): number {
  let n = chainLoad(s);
  for (const p of s.extraPipelines ?? []) {
    if (!p.enabled) continue;
    n += PIPELINE_OVERHEAD + chainLoad(p);
  }
  return n;
}

export function cpuOverBudget(s: CpuLoadSlice): {
  over: boolean;
  warn: boolean;
  load: number;
  budget: number;
} {
  const load = sessionLoad(s);
  const budget = cpuLoadBudget();
  return {
    over: load > budget,
    warn: load > budget * 0.8,
    load,
    budget,
  };
}

export function cpuRefuseMessage(load: number, budget: number) {
  return `CPU上限です（負荷 ${load}/${budget} · ${cpuCores()}コア）。ピッチ・残響を切るか、パイプラインを減らしてください`;
}

export function cpuWarnNote(load: number, budget: number) {
  return ` · 負荷 ${load}/${budget}`;
}

export function newExtraPipeline(number: number, cable: CableIndex): ExtraPipeline {
  const n = Math.max(2, Math.round(number));
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `pipe-${Date.now()}-${n}`,
    name: `パイプライン${n}`,
    enabled: true,
    number: n,
    inputCable: asCableIndex(cable),
    outputCable: asCableIndex(cable),
    spectrumFilters: [],
    obsInserts: [],
    cableInserts: [],
    deviceInserts: [],
    aiVoice: null,
    liveChain: [],
    fxSoloId: null,
    abHold: null,
  };
}
