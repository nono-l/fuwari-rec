import { useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DELAY_TUNE,
  DELAY_NOTES,
  delayTimeFromBpm,
  formatHz,
  type DelayNoteId,
  type DelayTune,
} from "@/lib/audio/spectrum-filters";
import { useEditorStore } from "@/lib/store/editor-store";

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
    hint: "繰り返しが左右に跳ねるか。0 は左右独立、上げると L→R→L",
    left: "独立",
    right: "跳ねる",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "spreadMs",
    label: "左右の時間差",
    hint: "右だけ少し長くする。ステレオ感。オフセットフィルターより短い差向け",
    left: "同じ",
    right: "右が遅い",
    min: 0,
    max: 80,
    step: 1,
    format: (n) => `${Math.round(n)} ms`,
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
  {
    key: "drive",
    label: "ドライブ",
    hint: "繰り返しにアナログ風の歪み。テープやペダルの温かみ",
    left: "きれい",
    right: "歪む",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "mod",
    label: "揺れ（深さ）",
    hint: "ディレイタイムをゆっくり揺らす。テープのwow",
    left: "固定",
    right: "揺れる",
    min: 0,
    max: 100,
    step: 1,
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: "modRate",
    label: "揺れの速さ",
    hint: "揺れが何回まわるか。遅いとうねり、速いとコーラスに近い",
    left: "遅い",
    right: "速い",
    min: 10,
    max: 800,
    step: 5,
    format: (n) => `${n.toFixed(2)} Hz`,
  },
];

function sliderValue(key: keyof DelayTune, n: number) {
  if (
    key === "feedback" ||
    key === "pingpong" ||
    key === "mod" ||
    key === "drive"
  ) {
    return Math.round(n * 100);
  }
  if (key === "modRate") return Math.round(n * 100);
  return Math.round(n);
}

function fromSlider(key: keyof DelayTune, v: number) {
  if (
    key === "feedback" ||
    key === "pingpong" ||
    key === "mod" ||
    key === "drive"
  ) {
    return v / 100;
  }
  if (key === "modRate") return v / 100;
  return v;
}

export function DelayTuneControls({
  value,
  onChange,
}: {
  value: DelayTune;
  onChange: (next: DelayTune) => void;
}) {
  const bpm = useEditorStore((s) => s.bpm);
  const syncedMs = delayTimeFromBpm(bpm, value.note, value.timeMs);

  useEffect(() => {
    if (!value.sync) return;
    if (Math.abs(value.timeMs - syncedMs) < 0.5) return;
    onChange({ ...value, timeMs: syncedMs });
  }, [value, syncedMs, onChange]);

  const setNote = (note: DelayNoteId) => {
    const ms = delayTimeFromBpm(bpm, note, value.timeMs);
    onChange({ ...value, note, timeMs: value.sync ? ms : value.timeMs });
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <label className="flex items-start gap-2 text-[11px] text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.sync}
          onChange={() => {
            const next = !value.sync;
            onChange({
              ...value,
              sync: next,
              timeMs: next
                ? delayTimeFromBpm(bpm, value.note, value.timeMs)
                : value.timeMs,
            });
          }}
        />
        <span>
          <span className="font-medium">テンポに合わせる</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
            セッションの BPM（いま {bpm > 0 ? bpm : "未設定 → 手動"}
            ）で音符の長さにする。曲と山彦を揃えるとき
          </span>
        </span>
      </label>
      {value.sync && (
        <div className="flex flex-wrap gap-1">
          {DELAY_NOTES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNote(n.id)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                value.note === n.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      )}
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>ディレイタイム</span>
          <span className="tabular-nums text-foreground">
            {Math.round(value.sync ? syncedMs : value.timeMs)} ms
          </span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          {value.sync
            ? "音符で決まります。BPM を変えると一緒に動きます"
            : "何ミリ秒あとに繰り返しが来るか。短いとスラップ、長いと山彦"}
        </p>
        <Slider
          min={20}
          max={1800}
          step={5}
          disabled={value.sync}
          value={[Math.round(value.sync ? syncedMs : value.timeMs)]}
          onValueChange={([n]) =>
            onChange({ ...value, timeMs: n ?? DEFAULT_DELAY_TUNE.timeMs })
          }
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>短い</span>
          <span>長い</span>
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
        onClick={() => onChange({ ...DEFAULT_DELAY_TUNE })}
      >
        ディレイの初期値に戻す
      </button>
    </div>
  );
}
