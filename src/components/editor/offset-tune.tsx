import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_OFFSET_TUNE,
  type OffsetTune,
} from "@/lib/audio/spectrum-filters";

export function OffsetTuneControls({
  value,
  onChange,
}: {
  value: OffsetTune;
  onChange: (next: OffsetTune) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>ずらす時間</span>
          <span className="tabular-nums text-foreground">
            {Math.round(value.timeMs)} ms
          </span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          繰り返しはありません。この分だけ、ずっと後ろにずれます。ディレイの山彦とは違います
        </p>
        <Slider
          min={5}
          max={1500}
          step={5}
          value={[Math.round(value.timeMs)]}
          onValueChange={([n]) =>
            onChange({ ...value, timeMs: n ?? DEFAULT_OFFSET_TUNE.timeMs })
          }
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>すぐ</span>
          <span>遅く</span>
        </div>
      </div>
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...DEFAULT_OFFSET_TUNE })}
      >
        オフセットの初期値に戻す
      </button>
    </div>
  );
}
