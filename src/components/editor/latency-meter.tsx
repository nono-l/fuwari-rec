import { useEffect, useState } from "react";
import { useEditorStore } from "@/lib/store/editor-store";
import { useActivePipeline } from "@/lib/store/use-active-pipeline";
import { getAiConvertRuntime } from "@/lib/audio/ai-convert-runtime";
import { getAudioEngine } from "@/lib/audio/engine";
import {
  formatMs,
  inferGuess,
  partsFromChain,
  sumMs,
} from "@/lib/audio/latency";
import { cn } from "@/lib/utils";

export function LatencyMeter() {
  const live = useEditorStore((s) => s.liveFxActive);
  const outputSafe = useEditorStore((s) => s.outputSafe);
  const deviceMs = useEditorStore((s) => s.deviceLatencyMs);
  const pipe = useActivePipeline();
  const [inferMs, setInferMs] = useState(0);
  const [provider, setProvider] = useState<"" | "webgpu" | "wasm">("");

  useEffect(() => {
    return getAiConvertRuntime().subscribe((st) => {
      setInferMs(st.lastInferMs);
      setProvider(st.provider);
    });
  }, []);

  let sr = 48000;
  try {
    sr = getAudioEngine().getSampleRate();
  } catch {
    /* engine not up */
  }

  const parts = partsFromChain(pipe.spectrumFilters, pipe.obsInserts, pipe.aiVoice, {
    sampleRate: sr,
    inferMs,
    provider,
    outputSafe,
  });
  const proc = sumMs(parts);
  const total = proc + (live ? deviceMs : 0);
  const aiOn = Boolean(pipe.aiVoice?.enabled && pipe.aiVoice.modelBytes > 0);
  const guess = aiOn ? inferGuess(provider, inferMs) : null;
  const heavy = total >= 80;

  return (
    <div className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-foreground">レイテンシ</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            オフセット・粒ピッチ・AIの合計。重いを秒で見ます
          </p>
        </div>
        <span
          className={cn(
            "text-[13px] font-semibold tabular-nums",
            heavy ? "text-danger" : "text-foreground",
          )}
        >
          {live ? formatMs(total) : "—"}
        </span>
      </div>
      {live && parts.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
          {parts.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>{p.label}</span>
              <span className="tabular-nums text-foreground">{formatMs(p.ms)}</span>
            </li>
          ))}
          {deviceMs > 0.5 && (
            <li className="flex justify-between gap-2">
              <span>端末</span>
              <span className="tabular-nums text-foreground">
                {formatMs(deviceMs)}
              </span>
            </li>
          )}
        </ul>
      )}
      {live && guess && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {provider === "webgpu"
            ? `いま WebGPU。WASM だと推論が約 ${formatMs(guess.other)}`
            : `いま WASM。WebGPU なら推論が約 ${formatMs(guess.other)}`}
        </p>
      )}
    </div>
  );
}
