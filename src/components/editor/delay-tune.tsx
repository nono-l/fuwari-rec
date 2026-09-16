import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_DELAY_TUNE,
  formatHz,
  type DelayTune,
} from "@/lib/audio/spectrum-filters";

const ROWS: {
  key: keyof DelayTune;
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
    key: "timeMs",
    label: "ディレイタイム",
    hint: "何ミリ秒あとに繰り返しが来るか。短いとスラップ、長いと山彦",
    left: "短い",
    right: "長い",
    min: 20,
    max: 1200,
    step: 5,
    format: (n) => `${Math.round(n)} ms`,
  },
  {
    key: "feedback",
    label: "フィードバック",
    hint: "繰り返しが何回残るか。上げすぎると鳴り続けます",
    left: "1回",
    right: "長く残る",
    min: 0,
    max: 85,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "pingpong",
    label: "ピンポン",
    hint: "繰り返しが左右に跳ねるか。0 は中央、上げると L→R→L",
    left: "中央",
    right: "左右",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "lowCutHz",
    label: "ローカット",
    hint: "繰り返しのボワつきを切る",
    left: "低音残す",
    right: "切る",
    min: 40,
    max: 400,
    step: 5,
    format: (n) => formatHz(n),
  },
  {
    key: "highCutHz",
    label: "ハイカット",
    hint: "繰り返しの刺さる高域を切る。回すほど暗くしたいとき",
    left: "高音残す",
    right: "切る",
    min: 800,
    max: 16000,
    step: 50,
    format: (n) => formatHz(n),
  },
];

function sliderValue(key: keyof DelayTune, n: number) {
  if (key === "feedback" || key === "pingpong") return Math.round(n * 100);
  return Math.round(n);
}

function fromSlider(key: keyof DelayTune, v: number) {
  if (key === "feedback" || key === "pingpong") return v / 100;
  return v;
}

export function DelayTuneControls({
  value,
  onChange,
}: {
  value: DelayTune;
  onChange: (next: DelayTune) => void;
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
        onClick={() => onChange({ ...DEFAULT_DELAY_TUNE })}
      >
        ディレイの初期値に戻す
      </button>
    </div>
  );
}
