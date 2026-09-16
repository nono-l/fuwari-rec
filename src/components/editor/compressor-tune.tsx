import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_COMP_TUNE,
  type CompTune,
} from "@/lib/audio/obs-filters";

const ROWS: {
  key: keyof CompTune;
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
    hint: "元の声と圧縮した声。右だけだと音量差が一番小さくなります",
    left: "元の声",
    right: "圧縮だけ",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "thresholdDb",
    label: "スレッショルド",
    hint: "この大きさ以上を抑える。左ほど小さい声から効く。歌は −18〜−24 dB が無難です",
    left: "すぐ効く",
    right: "大きい音だけ",
    min: -60,
    max: 0,
    step: 0.5,
    format: (n) => `${n.toFixed(1)} dB`,
  },
  {
    key: "ratio",
    label: "レシオ",
    hint: "超えた分を何分の1にするか。2:1 は軽い、6:1 は歌、12:1 以上はリミッター寄り",
    left: "弱い",
    right: "強い",
    min: 10,
    max: 200,
    step: 1,
    format: (n) => `${n.toFixed(1)} : 1`,
  },
  {
    key: "kneeDb",
    label: "ニー",
    hint: "スレッショルドの手前からなだらかに効かせる幅。0 は急に、広いと自然",
    left: "急",
    right: "なだらか",
    min: 0,
    max: 40,
    step: 0.5,
    format: (n) => `${n.toFixed(1)} dB`,
  },
  {
    key: "attackMs",
    label: "アタック",
    hint: "効き始める速さ。短いと子音も潰れる、長いと頭の勢いが残る",
    left: "すぐ",
    right: "遅らせる",
    min: 5,
    max: 800,
    step: 5,
    format: (n) => `${n.toFixed(1)} ms`,
  },
  {
    key: "releaseMs",
    label: "リリース",
    hint: "静かになったあと、いつ元の大きさに戻るか。短いとポンピング、長いとなめらか",
    left: "すぐ戻る",
    right: "ゆっくり",
    min: 20,
    max: 1000,
    step: 5,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "makeupDb",
    label: "メイクアップ",
    hint: "圧縮で下がった平均を持ち上げる。ピークは抑えたまま、聞こえを戻す",
    left: "そのまま",
    right: "持ち上げる",
    min: 0,
    max: 24,
    step: 0.5,
    format: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)} dB`,
  },
];

function sliderValue(key: keyof CompTune, n: number) {
  if (key === "mix") return Math.round(n * 100);
  if (key === "ratio") return Math.round(n * 10);
  if (key === "attackMs") return Math.round(n * 10);
  return Math.round(n * 10) / 10;
}

function fromSlider(key: keyof CompTune, v: number) {
  if (key === "mix") return v / 100;
  if (key === "ratio") return v / 10;
  if (key === "attackMs") return v / 10;
  return v;
}

export function CompTuneControls({
  value,
  onChange,
}: {
  value: CompTune;
  onChange: (next: CompTune) => void;
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
        onClick={() => onChange({ ...DEFAULT_COMP_TUNE })}
      >
        コンプの初期値に戻す
      </button>
    </div>
  );
}
