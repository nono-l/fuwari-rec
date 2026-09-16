import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_GATE_TUNE,
  type GateTune,
} from "@/lib/audio/obs-filters";

const ROWS: {
  key: keyof GateTune;
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
    hint: "元の声とゲート後。右だけだと小さい音がフロアまで落ちます",
    left: "元の声",
    right: "ゲートだけ",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "thresholdDb",
    label: "スレッショルド",
    hint: "この大きさ未満を閉じる。部屋のノイズのすぐ上。歌は −32〜−40 dB が無難です",
    left: "小さい音も通す",
    right: "すぐ閉じる",
    min: -80,
    max: 0,
    step: 0.5,
    format: (n) => `${n.toFixed(1)} dB`,
  },
  {
    key: "attackMs",
    label: "アタック",
    hint: "開く速さ。短いと子音の頭が残る、長いと頭が欠ける",
    left: "すぐ開く",
    right: "ゆっくり",
    min: 5,
    max: 400,
    step: 5,
    format: (n) => `${n.toFixed(1)} ms`,
  },
  {
    key: "holdMs",
    label: "ホールド",
    hint: "スレッショルドを下回ったあと、すぐ閉じず開けておく時間。チャタリング防止",
    left: "すぐ閉じ始める",
    right: "開けたまま",
    min: 0,
    max: 400,
    step: 5,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "releaseMs",
    label: "リリース",
    hint: "閉じる速さ。短いと語尾が切れる、長いとノイズが尾を引く",
    left: "すぐ閉じる",
    right: "ゆっくり",
    min: 10,
    max: 800,
    step: 5,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "floor",
    label: "フロア",
    hint: "閉じたあとに残す量。0 は無音、少し残すと不自然な切れが減ります",
    left: "無音",
    right: "あまり落とさない",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
];

function sliderValue(key: keyof GateTune, n: number) {
  if (key === "mix" || key === "floor") return Math.round(n * 100);
  if (key === "attackMs") return Math.round(n * 10);
  return n;
}

function fromSlider(key: keyof GateTune, v: number) {
  if (key === "mix" || key === "floor") return v / 100;
  if (key === "attackMs") return v / 10;
  return v;
}

export function GateTuneControls({
  value,
  onChange,
}: {
  value: GateTune;
  onChange: (next: GateTune) => void;
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
        onClick={() => onChange({ ...DEFAULT_GATE_TUNE })}
      >
        ゲートの初期値に戻す
      </button>
    </div>
  );
}
