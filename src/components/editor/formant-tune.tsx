import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FORMANT_TUNE,
  formatHz,
  formantScaledHz,
  type FormantTune,
} from "@/lib/audio/spectrum-filters";

const VOWELS: {
  id: string;
  label: string;
  hint: string;
  f1Hz: number;
  f2Hz: number;
  f3Hz: number;
}[] = [
  { id: "a", label: "あ", hint: "口を開く", f1Hz: 800, f2Hz: 1200, f3Hz: 2500 },
  { id: "i", label: "い", hint: "細い前舌", f1Hz: 300, f2Hz: 2300, f3Hz: 3000 },
  { id: "u", label: "う", hint: "丸めて後ろ", f1Hz: 350, f2Hz: 800, f3Hz: 2400 },
  { id: "e", label: "え", hint: "やや前舌", f1Hz: 500, f2Hz: 1900, f3Hz: 2600 },
  { id: "o", label: "お", hint: "丸めて開く", f1Hz: 500, f2Hz: 900, f3Hz: 2400 },
];

const ROWS: {
  key: keyof FormantTune;
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
    hint: "元の声と、フォルマントを付けた声。右だけだと色がはっきり出ます",
    left: "元の声",
    right: "フォルマントだけ",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "gender",
    label: "性別（声道の長さ）",
    hint: "F1〜F3をまとめてずらします。左は長く太い共鳴、右は短く高い共鳴。個別の周波数はそのあとで微調整できます",
    left: "太い・低い",
    right: "細い・高い",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "f1Hz",
    label: "F1（第1フォルマント）",
    hint: "母音の「あ・お」側。上げると口が開いた感じ、下げると閉じた感じ",
    left: "閉じる",
    right: "開く",
    min: 200,
    max: 1200,
    step: 5,
    format: (n) => formatHz(n),
  },
  {
    key: "q1",
    label: "F1 帯域幅",
    hint: "このピークの鋭さ。狭いとピンポイント、広いとふわっと色が付く",
    left: "広い",
    right: "鋭い",
    min: 40,
    max: 800,
    step: 5,
    format: (n) => n.toFixed(1),
  },
  {
    key: "f2Hz",
    label: "F2（第2フォルマント）",
    hint: "母音の「い・え」側。上げると前舌（い）、下げると後舌（う・お）",
    left: "後ろ",
    right: "前",
    min: 500,
    max: 3200,
    step: 10,
    format: (n) => formatHz(n),
  },
  {
    key: "q2",
    label: "F2 帯域幅",
    hint: "F2ピークの鋭さ。狭いと母音がはっきり、広いとなじむ",
    left: "広い",
    right: "鋭い",
    min: 40,
    max: 800,
    step: 5,
    format: (n) => n.toFixed(1),
  },
  {
    key: "f3Hz",
    label: "F3（第3フォルマント）",
    hint: "声の明るさ・個性。上げるとキラキラ、下げるとこもる",
    left: "こもる",
    right: "明るい",
    min: 1400,
    max: 4500,
    step: 10,
    format: (n) => formatHz(n),
  },
  {
    key: "q3",
    label: "F3 帯域幅",
    hint: "F3ピークの鋭さ。狭いと金属っぽい、広いと自然",
    left: "広い",
    right: "鋭い",
    min: 40,
    max: 800,
    step: 5,
    format: (n) => n.toFixed(1),
  },
];

function sliderValue(key: keyof FormantTune, n: number) {
  if (key === "mix" || key === "gender") return Math.round(n * 100);
  if (key === "q1" || key === "q2" || key === "q3") return Math.round(n * 100);
  return Math.round(n);
}

function fromSlider(key: keyof FormantTune, v: number) {
  if (key === "mix" || key === "gender") return v / 100;
  if (key === "q1" || key === "q2" || key === "q3") return v / 100;
  return v;
}

export function FormantTuneControls({
  value,
  onChange,
}: {
  value: FormantTune;
  onChange: (next: FormantTune) => void;
}) {
  const scaled = formantScaledHz(value);
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div>
        <div className="mb-1 text-[11px] font-medium text-foreground">
          母音の型
        </div>
        <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
          F1とF2の位置を、日本語の母音に寄せます。性別スライダーはそのあと効きます
        </p>
        <div className="flex flex-wrap gap-1">
          {VOWELS.map((v) => {
            const on =
              Math.abs(value.f1Hz - v.f1Hz) < 8 &&
              Math.abs(value.f2Hz - v.f2Hz) < 12;
            return (
              <button
                key={v.id}
                type="button"
                title={v.hint}
                onClick={() =>
                  onChange({
                    ...value,
                    f1Hz: v.f1Hz,
                    f2Hz: v.f2Hz,
                    f3Hz: v.f3Hz,
                  })
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        今の共鳴 {formatHz(scaled.f1)} / {formatHz(scaled.f2)} /{" "}
        {formatHz(scaled.f3)}
        （性別をかけたあと）
      </p>
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
        onClick={() => onChange({ ...DEFAULT_FORMANT_TUNE })}
      >
        フォルマントの初期値に戻す
      </button>
    </div>
  );
}
