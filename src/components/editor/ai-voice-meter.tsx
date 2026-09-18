import { formatHz, hzToMidi, midiToNoteName } from "@/lib/audio/pitch";
import { formatMs } from "@/lib/audio/latency";
import type { AiConvertState } from "@/lib/audio/ai-convert-runtime";

export function AiVoiceMeter({
  convert,
  mix,
}: {
  convert: AiConvertState;
  mix: number;
}) {
  const f0 = convert.f0Hz;
  const note = f0 > 50 ? midiToNoteName(hzToMidi(f0)) : "—";
  const wet = Math.round(convert.convertRatio * mix * 100);
  const delay = convert.convertRatio > 0.05 ? convert.hopMs + convert.lastInferMs : 0;
  const live = convert.status === "running" || convert.convertRatio > 0.15;

  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">AIボイスメーター</p>
      <div className="mt-1 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">変換</div>
          <div className="text-[12px] font-semibold tabular-nums text-foreground">
            {live ? `${wet}%` : "素通り"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">F0</div>
          <div className="text-[12px] font-semibold tabular-nums text-foreground">
            {note}
          </div>
          <div className="text-[10px] tabular-nums text-muted-foreground">
            {f0 > 50 ? formatHz(f0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">遅延</div>
          <div className="text-[12px] font-semibold tabular-nums text-foreground">
            {delay > 1 ? formatMs(delay) : "0 ms"}
          </div>
        </div>
      </div>
      <p className="mt-1.5 break-words text-[10px] leading-relaxed text-muted-foreground">
        {convert.detail
          ? convert.detail
          : live
            ? convert.provider
              ? `推論 ${formatMs(convert.lastInferMs)} · ${convert.provider}`
              : "変換しています"
            : "モデルがなくても F0 は出ます"}
      </p>
    </div>
  );
}
