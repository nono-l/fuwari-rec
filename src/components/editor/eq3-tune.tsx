import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_EQ3_TUNE,
  type Eq3Tune,
} from "@/lib/audio/obs-filters";
import { formatHz } from "@/lib/audio/spectrum-filters";

type Band = {
  gain: keyof Eq3Tune;
  hz: keyof Eq3Tune;
  q: keyof Eq3Tune;
  label: string;
  role: string;
  hzMin: number;
  hzMax: number;
  hzLeft: string;
  hzRight: string;
};

const BANDS: Band[] = [
  {
    gain: "lowGain",
    hz: "lowHz",
    q: "lowQ",
    label: "低",
    role: "シェルフ。声の厚みやエアコンのゴロゴロ",
    hzMin: 40,
    hzMax: 800,
    hzLeft: "ゴロゴロ",
    hzRight: "厚み",
  },
  {
    gain: "midGain",
    hz: "midHz",
    q: "midQ",
    label: "中",
    role: "ピーク。声の芯や鼻にかかる帯",
    hzMin: 200,
    hzMax: 4000,
    hzLeft: "厚み",
    hzRight: "芯・子音",
  },
  {
    gain: "highGain",
    hz: "highHz",
    q: "highQ",
    label: "高",
    role: "シェルフ。空気感とヒス",
    hzMin: 1500,
    hzMax: 16000,
    hzLeft: "芯",
    hzRight: "空気感",
  },
];

function db(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v} dB`;
}

function logFromHz(hz: number, min: number, max: number) {
  const t = Math.log(Math.max(min, Math.min(max, hz)) / min) / Math.log(max / min);
  return Math.round(t * 1000);
}

function hzFromLog(v: number, min: number, max: number) {
  return min * Math.pow(max / min, (v ?? 0) / 1000);
}

export function Eq3TuneControls({
  value,
  onChange,
}: {
  value: Eq3Tune;
  onChange: (next: Eq3Tune) => void;
}) {
  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {BANDS.map((b) => (
        <div key={b.label} className="space-y-2 border-b border-border/60 pb-3 last:border-0 last:pb-0">
          <div className="text-[12px] font-medium text-foreground">
            {b.label}
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
              {b.role}
            </span>
          </div>
          <div>
            <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
              <span>ゲイン</span>
              <span className="tabular-nums text-foreground">
                {db(value[b.gain] as number)}
              </span>
            </div>
            <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
              この帯を上げ下げする。±3 dB から試すのが無難です
            </p>
            <Slider
              min={-12}
              max={12}
              step={0.5}
              value={[value[b.gain] as number]}
              onValueChange={([n]) =>
                onChange({ ...value, [b.gain]: n ?? 0 })
              }
            />
          </div>
          <div>
            <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
              <span>周波数</span>
              <span className="tabular-nums text-foreground">
                {formatHz(value[b.hz] as number)}
              </span>
            </div>
            <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
              効く位置。低は厚み、中は声の芯、高は空気感
            </p>
            <Slider
              min={0}
              max={1000}
              step={1}
              value={[logFromHz(value[b.hz] as number, b.hzMin, b.hzMax)]}
              onValueChange={([n]) =>
                onChange({ ...value, [b.hz]: hzFromLog(n ?? 0, b.hzMin, b.hzMax) })
              }
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{b.hzLeft}</span>
              <span>{b.hzRight}</span>
            </div>
          </div>
          <div>
            <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Q</span>
              <span className="tabular-nums text-foreground">
                {(value[b.q] as number).toFixed(1)}
              </span>
            </div>
            <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
              {b.label === "中"
                ? "幅。低いと広い丘、高いとピンポイント"
                : "境目の急さ。高いと角が立つ"}
            </p>
            <Slider
              min={3}
              max={80}
              step={1}
              value={[Math.round((value[b.q] as number) * 10)]}
              onValueChange={([n]) =>
                onChange({ ...value, [b.q]: (n ?? 7) / 10 })
              }
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...DEFAULT_EQ3_TUNE })}
      >
        3バンドEQの初期値に戻す
      </button>
    </div>
  );
}
