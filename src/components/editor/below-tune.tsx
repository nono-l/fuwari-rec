import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_EXPANDER_TUNE,
  DEFAULT_UPWARD_TUNE,
  type BelowTune,
} from "@/lib/audio/obs-filters";

const UP_HINTS = {
  mix: {
    label: "混ぜ",
    hint: "元の声と持ち上げ後。右だけだと小さい声が寄ってきます",
    left: "元の声",
    right: "持ち上げだけ",
  },
  thresholdDb: {
    label: "スレッショルド",
    hint: "この大きさ未満を持ち上げる。歌は −15〜−24 dB が無難です",
    left: "小さい声だけ",
    right: "大きめまで",
  },
  ratio: {
    label: "レシオ",
    hint: "どれだけ寄せるか。2:1 は自然、4:1 はささやきがかなり前に出ます",
    left: "弱い",
    right: "強い",
  },
  attackMs: {
    label: "アタック",
    hint: "持ち上げが始まる速さ。短いと子音も持ち上がる",
    left: "すぐ",
    right: "遅らせる",
  },
  releaseMs: {
    label: "リリース",
    hint: "声が大きくなったあと、いつ持ち上げをやめるか",
    left: "すぐ戻る",
    right: "ゆっくり",
  },
} as const;

const EXP_HINTS = {
  mix: {
    label: "混ぜ",
    hint: "元の声と拡張後。右だけだと小さい不要音がより小さくなります",
    left: "元の声",
    right: "拡張だけ",
  },
  thresholdDb: {
    label: "スレッショルド",
    hint: "この大きさ未満をさらに小さくする。ノイズのすぐ上。−35〜−45 dB が無難です",
    left: "小さい音だけ",
    right: "大きめまで",
  },
  ratio: {
    label: "レシオ",
    hint: "下回った分を何倍小さくするか。2:1 は軽い、4:1 はゲートに近い",
    left: "弱い",
    right: "強い",
  },
  attackMs: {
    label: "アタック",
    hint: "閉じ始める速さ。短いと子音の頭も削れる",
    left: "すぐ",
    right: "遅らせる",
  },
  releaseMs: {
    label: "リリース",
    hint: "声が出たあと、いつ元の大きさに戻るか",
    left: "すぐ戻る",
    right: "ゆっくり",
  },
} as const;

const KEYS: (keyof BelowTune)[] = [
  "mix",
  "thresholdDb",
  "ratio",
  "attackMs",
  "releaseMs",
];

function sliderMeta(key: keyof BelowTune) {
  if (key === "mix") return { min: 0, max: 100, step: 1 };
  if (key === "thresholdDb") return { min: -80, max: 0, step: 0.5 };
  if (key === "ratio") return { min: 10, max: 80, step: 1 };
  if (key === "attackMs") return { min: 5, max: 800, step: 5 };
  return { min: 10, max: 800, step: 5 };
}

function sliderValue(key: keyof BelowTune, n: number) {
  if (key === "mix") return Math.round(n * 100);
  if (key === "ratio" || key === "attackMs") return Math.round(n * 10);
  return n;
}

function fromSlider(key: keyof BelowTune, v: number) {
  if (key === "mix") return v / 100;
  if (key === "ratio" || key === "attackMs") return v / 10;
  return v;
}

function format(key: keyof BelowTune, n: number) {
  if (key === "mix") return `${Math.round(n * 100)}%`;
  if (key === "thresholdDb") return `${n.toFixed(1)} dB`;
  if (key === "ratio") return `${n.toFixed(1)} : 1`;
  if (key === "attackMs") return `${n.toFixed(1)} ms`;
  return `${Math.round(n)} ms`;
}

export function BelowTuneControls({
  mode,
  value,
  onChange,
}: {
  mode: "upward" | "expander";
  value: BelowTune;
  onChange: (next: BelowTune) => void;
}) {
  const hints = mode === "upward" ? UP_HINTS : EXP_HINTS;
  const reset = mode === "upward" ? DEFAULT_UPWARD_TUNE : DEFAULT_EXPANDER_TUNE;
  const resetLabel =
    mode === "upward" ? "アップワードの初期値に戻す" : "エキスパンダーの初期値に戻す";
  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {KEYS.map((key) => {
        const h = hints[key];
        const meta = sliderMeta(key);
        return (
          <div key={key}>
            <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{h.label}</span>
              <span className="tabular-nums text-foreground">
                {format(key, value[key])}
              </span>
            </div>
            <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
              {h.hint}
            </p>
            <Slider
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={[sliderValue(key, value[key])]}
              onValueChange={([n]) =>
                onChange({ ...value, [key]: fromSlider(key, n ?? 0) })
              }
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{h.left}</span>
              <span>{h.right}</span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...reset })}
      >
        {resetLabel}
      </button>
    </div>
  );
}
