import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_LIMITER_TUNE,
  type LimiterTune,
} from "@/lib/audio/obs-filters";

const ROWS: {
  key: keyof LimiterTune;
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
    key: "mix",
    label: "混ぜ",
    hint: "元の声とリミット後。右だけだとピークが天井を超えません",
    left: "元の声",
    right: "リミットだけ",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "ceilingDb",
    label: "シーリング",
    hint: "ピークの上限。0 dB が最大。配信は −1〜−3 dB、歌の tail は −3〜−6 dB が無難です",
    left: "低く抑える",
    right: "上限いっぱい",
    min: -12,
    max: 0,
    step: 0.1,
    format: (n) => `${n.toFixed(1)} dB`,
  },
  {
    key: "lookaheadMs",
    label: "ルックアヘッド",
    hint: "ピークの手前から抑える待ち時間。0 だと頭が突き抜けやすい。2〜5 ms が定番です",
    left: "即時",
    right: "先読み",
    min: 0,
    max: 15,
    step: 0.1,
    format: (n) => `${n.toFixed(1)} ms`,
  },
  {
    key: "releaseMs",
    label: "リリース",
    hint: "ピークが過ぎたあと、いつ元の大きさに戻るか。短いとポンピング、長いと平均が下がったまま",
    left: "すぐ戻る",
    right: "ゆっくり",
    min: 10,
    max: 400,
    step: 5,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "makeupDb",
    label: "メイクアップ",
    hint: "リミットで下がった平均を持ち上げる。上げすぎるとまたクリップします",
    left: "そのまま",
    right: "持ち上げる",
    min: 0,
    max: 24,
    step: 0.5,
    format: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)} dB`,
  },
];

function sliderValue(key: keyof LimiterTune, n: number) {
  if (key === "mix") return Math.round(n * 100);
  return n;
}

function fromSlider(key: keyof LimiterTune, v: number) {
  if (key === "mix") return v / 100;
  return v;
}

export function LimiterTuneControls({
  value,
  onChange,
}: {
  value: LimiterTune;
  onChange: (next: LimiterTune) => void;
}) {
  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
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
        onClick={() => onChange({ ...DEFAULT_LIMITER_TUNE })}
      >
        リミッターの初期値に戻す
      </button>
    </div>
  );
}
