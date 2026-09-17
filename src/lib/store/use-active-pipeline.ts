import { useEditorStore } from "@/lib/store/editor-store";

export function useActivePipeline() {
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const extraPipelines = useEditorStore((s) => s.extraPipelines);
  const extra = extraPipelines.find((p) => p.id === activePipelineId) ?? null;
  const spectrumFilters = useEditorStore((s) => s.spectrumFilters);
  const obsInserts = useEditorStore((s) => s.obsInserts);
  const aiVoice = useEditorStore((s) => s.aiVoice);
  const cableInserts = useEditorStore((s) => s.cableInserts);
  const deviceInserts = useEditorStore((s) => s.deviceInserts);
  const liveChain = useEditorStore((s) => s.liveChain);
  const mainSolo = useEditorStore((s) => s.fxSoloId);
  const mainHold = useEditorStore((s) => s.abHold);

  if (extra) {
    return {
      id: extra.id,
      number: extra.number,
      name: extra.name,
      isMain: false as const,
      enabled: extra.enabled,
      inputCable: extra.inputCable,
      outputCable: extra.outputCable,
      spectrumFilters: extra.spectrumFilters,
      obsInserts: extra.obsInserts,
      aiVoice: extra.aiVoice,
      cableInserts: extra.cableInserts ?? [],
      deviceInserts: extra.deviceInserts ?? [],
      liveChain: extra.liveChain,
      fxSoloId: extra.fxSoloId ?? null,
      hasAbHold: Boolean(extra.abHold),
    };
  }
  return {
    id: "main" as const,
    number: 1,
    name: "パイプライン1",
    isMain: true as const,
    enabled: true,
    inputCable: 1 as const,
    outputCable: 1 as const,
    spectrumFilters,
    obsInserts,
    aiVoice,
    cableInserts,
    deviceInserts,
    liveChain,
    fxSoloId: mainSolo,
    hasAbHold: Boolean(mainHold),
  };
}
