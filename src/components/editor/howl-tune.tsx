import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_HOWL_TUNE,
  type HowlTune,
} from "@/lib/audio/obs-filters";

const ROWS: {
  key: keyof HowlTune;
  label: string;
  hint: string;
  left: string;
  right: string;
}[] = [
  {
    key: "speed",
    label: "速さ",
    hint: "ピーと鳴り始めてからノッチを置くまで。速いとすぐ切るが、歌の倍音も誤って切りやすい",
    left: "慎重",
    right: "すぐ切る",
  },
  {
    key: "depth",
    label: "深さ",
    hint: "ノッチの本数と鋭さ。深いほどハウリングは止まるが、声の芯も削れます",
    left: "浅い",
    right: "深く切る",
  },
  {
    key: "hold",
    label: "ホールド",
    hint: "鳴きが止まったあと、ノッチを残す長さ。短いと再発しやすい",
    left: "すぐ外す",
    right: "残す",
  },
];

export function HowlTuneControls({
  value,
  onChange,
}: {
  value: HowlTune;
  onChange: (next: HowlTune) => void;
}) {
  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {ROWS.map((row) => (
        <div key={row.key}>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{row.label}</span>
            <span className="tabular-nums text-foreground">
              {Math.round(value[row.key] * 100)}%
            </span>
          </div>
          <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            {row.hint}
          </p>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(value[row.key] * 100)]}
            onValueChange={([n]) =>
              onChange({ ...value, [row.key]: (n ?? 0) / 100 })
            }
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>{row.left}</span>
            <span>{row.right}</span>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...DEFAULT_HOWL_TUNE })}
      >
        ハウリングキャンセラーの初期値に戻す
      </button>
    </div>
  );
}
