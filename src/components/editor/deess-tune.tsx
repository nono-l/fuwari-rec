import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_DEESS_TUNE,
  type DeessTune,
} from "@/lib/audio/spectrum-filters";

const ROWS: {
  key: keyof DeessTune;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  left: string;
  right: string;
}[] = [
  {
    key: "thresholdDb",
    label: "始める大きさ",
    hint: "この大きさ以上のサ行だけ潰します。上げると歯擦音が残ります",
    min: -48,
    max: -6,
    step: 1,
    format: (n) => `${n.toFixed(0)} dB`,
    left: "小さいSも",
    right: "大きいSだけ",
  },
  {
    key: "ratio",
    label: "潰し方",
    hint: "超えた分を何倍つぶすか。高いほどサが平らになります",
    min: 2,
    max: 12,
    step: 0.5,
    format: (n) => `${n.toFixed(1)}:1`,
    left: "やさしく",
    right: "強く",
  },
  {
    key: "attackMs",
    label: "立ち上がり",
    hint: "サの頭を掴む速さ。遅すぎると歯が残ります",
    min: 0.2,
    max: 12,
    step: 0.1,
    format: (n) => `${n.toFixed(1)} ms`,
    left: "すぐ",
    right: "ゆるく",
  },
  {
    key: "releaseMs",
    label: "戻り",
    hint: "潰したあとに元へ戻る速さ。短いとポンプ、長いと次の母音も沈みます",
    min: 20,
    max: 180,
    step: 1,
    format: (n) => `${Math.round(n)} ms`,
    left: "すぐ戻る",
    right: "ゆっくり",
  },
];

export function DeessTuneControls({
  value,
  onChange,
}: {
  value: DeessTune;
  onChange: (next: DeessTune) => void;
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
            value={[value[row.key]]}
            onValueChange={([n]) =>
              onChange({ ...value, [row.key]: n ?? DEFAULT_DEESS_TUNE[row.key] })
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
        onClick={() => onChange({ ...DEFAULT_DEESS_TUNE })}
      >
        ディエッサーの初期値に戻す
      </button>
    </div>
  );
}
