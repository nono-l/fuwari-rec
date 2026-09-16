import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PITCH_TUNE,
  type PitchTune,
} from "@/lib/audio/spectrum-filters";

const GRAINS = [
  { id: 512, label: "細かい" },
  { id: 1024, label: "標準" },
  { id: 2048, label: "なめらか" },
] as const;

const ROWS: {
  key: keyof PitchTune;
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
    key: "cents",
    label: "セント（微調整）",
    hint: "半音のあいだ。合唱のデチューンや、ぴったり合わせるとき",
    left: "−50",
    right: "＋50",
    min: -50,
    max: 50,
    step: 1,
    format: (n) => `${n > 0 ? "+" : ""}${Math.round(n)} cent`,
  },
  {
    key: "preserve",
    label: "フォルマントを残す",
    hint: "上げると声帯の長さを保つ。0 はチップマンク、右は大人の声のままキーだけ変わる",
    left: "ついていく",
    right: "残す",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "formant",
    label: "フォルマント",
    hint: "声の色を別にずらす。下げると太く、上げると細くなる",
    left: "太い",
    right: "細い",
    min: -120,
    max: 120,
    step: 1,
    format: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`,
  },
  {
    key: "mix",
    label: "混ぜ",
    hint: "元の高さとシフト後。ハーモニーにするなら真ん中付近",
    left: "元の高さ",
    right: "シフトだけ",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "feedback",
    label: "フィードバック",
    hint: "シフトした音をもう一度通す。ハーモナイザーの積み上げ",
    left: "1回",
    right: "積む",
    min: 0,
    max: 70,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "delayMs",
    label: "フィードバックの間隔",
    hint: "積み上げるときの間隔。短いと金属、長いとアルペジオ",
    left: "すぐ",
    right: "間を空ける",
    min: 0,
    max: 200,
    step: 1,
    format: (n) => `${Math.round(n)} ms`,
  },
];

function sliderValue(key: keyof PitchTune, n: number) {
  if (key === "preserve" || key === "mix" || key === "feedback") {
    return Math.round(n * 100);
  }
  if (key === "formant") return Math.round(n * 10);
  return Math.round(n);
}

function fromSlider(key: keyof PitchTune, v: number) {
  if (key === "preserve" || key === "mix" || key === "feedback") return v / 100;
  if (key === "formant") return v / 10;
  return v;
}

export function PitchTuneControls({
  value,
  onChange,
}: {
  value: PitchTune;
  onChange: (next: PitchTune) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div>
        <div className="mb-1 text-[11px] font-medium text-foreground">
          粒の大きさ
        </div>
        <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
          小さいほど遅れが少なく、大きいほど音がきれい。声は標準が無難です
        </p>
        <div className="flex flex-wrap gap-1">
          {GRAINS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange({ ...value, grain: g.id })}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                value.grain === g.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {ROWS.map((row) => (
        <div key={row.key}>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{row.label}</span>
            <span className="tabular-nums text-foreground">
              {row.format(value[row.key] as number)}
            </span>
          </div>
          <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            {row.hint}
          </p>
          <Slider
            min={row.min}
            max={row.max}
            step={row.step}
            value={[sliderValue(row.key, value[row.key] as number)]}
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
        onClick={() => onChange({ ...DEFAULT_PITCH_TUNE })}
      >
        ピッチの初期値に戻す
      </button>
    </div>
  );
}
