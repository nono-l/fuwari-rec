import type { SpectrumFilter } from "./spectrum-filters";
import type { ObsInsert } from "./obs-filters";
import type { LiveSlot } from "./live-fx";
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
};

export const MAX_PIPELINES = 7;

export function extraPipelineBudget(): number {
  return MAX_PIPELINES - 1;
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
  };
}
