import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_REVERB_TUNE,
  formatHz,
  type ReverbTune,
} from "@/lib/audio/spectrum-filters";

const ROWS: {
  key: keyof ReverbTune;
  label: string;
  hint: string;
  left: string;
  right: string;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}[] = [
  {
    key: "decay",
    label: "長さ（減衰）",
    hint: "余韻がすぐ消える／ホールまで残る",
    left: "短い",
    right: "長い",
    min: 40,
    max: 400,
    step: 5,
    format: (n) => `${n.toFixed(1)} 秒`,
  },
  {
    key: "predelayMs",
    label: "プリディレイ",
    hint: "声の芯のあとに残響が来る間隔",
    left: "すぐ",
    right: "間を空ける",
    min: 0,
    max: 80,
    step: 1,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "brightness",
    label: "明るさ（ダンピング）",
    hint: "残響の高域がすぐ死ぬ／キラキラ残る",
    left: "暗い",
    right: "明るい",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "size",
    label: "サイズ",
    hint: "狭い部屋／広いホールの密度",
    left: "部屋",
    right: "ホール",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "lowCutHz",
    label: "ローカット",
    hint: "残響のボワつきを切る",
    left: "低音残す",
    right: "切る",
    min: 40,
    max: 400,
    step: 5,
    format: (n) => formatHz(n),
  },
];

function sliderValue(key: keyof ReverbTune, n: number) {
  if (key === "decay") return Math.round(n * 100);
  if (key === "brightness" || key === "size") return Math.round(n * 100);
  return Math.round(n);
}

function fromSlider(key: keyof ReverbTune, v: number) {
  if (key === "decay") return v / 100;
  if (key === "brightness" || key === "size") return v / 100;
  return v;
}

export function ReverbTuneControls({
  value,
  onChange,
}: {
  value: ReverbTune;
  onChange: (next: ReverbTune) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {ROWS.map((row) => (
        <div key={row.key}>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{row.label}</span>
            <span className="tabular-nums text-foreground">
              {row.format(value[row.key])}
            </span>
          </div>
          <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            {row.hint}
          </p>
          <Slider
            min={row.min}
            max={row.max}
            step={row.step}
            value={[sliderValue(row.key, value[row.key])]}
            onValueChange={([n]) =>
              onChange({ ...value, [row.key]: fromSlider(row.key, n ?? 0) })
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
        onClick={() => onChange({ ...DEFAULT_REVERB_TUNE })}
      >
        残響の初期値に戻す
      </button>
    </div>
  );
}
