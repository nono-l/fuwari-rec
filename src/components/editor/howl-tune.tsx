import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_HOWL_TUNE,
  type HowlTune,
} from "@/lib/audio/obs-filters";
import {
  formatHowlHz,
  readHowl,
  subscribeHowl,
  type HowlLive,
} from "@/lib/audio/howl-report";

const ROWS: {
  key: keyof HowlTune;
  label: string;
  hint: string;
  left: string;
  right: string;
}[] = [
  {
    key: "speed",
    label: "速さ",
    hint: "ピーと鳴り始めてからノッチを置くまで。速いとすぐ切るが、歌の倍音も誤って切りやすい",
    left: "慎重",
    right: "すぐ切る",
  },
  {
    key: "depth",
    label: "深さ",
    hint: "ノッチの本数と鋭さ。深いほどハウリングは止まるが、声の芯も削れます",
    left: "浅い",
    right: "深く切る",
  },
  {
    key: "hold",
    label: "ホールド",
    hint: "鳴きが止まったあと、ノッチを残す長さ。短いと再発しやすい",
    left: "すぐ外す",
    right: "残す",
  },
];

export function HowlTuneControls({
  insertId,
  value,
  onChange,
}: {
  insertId?: string;
  value: HowlTune;
  onChange: (next: HowlTune) => void;
}) {
  const [live, setLive] = useState<HowlLive>({ locked: [], rising: [] });
  useEffect(() => {
    if (!insertId) return;
    const pull = () => setLive(readHowl(insertId));
    pull();
    return subscribeHowl(pull);
  }, [insertId]);

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {insertId ? (
        <div
          className={
            live.locked.length
              ? "rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5"
              : "rounded-md border border-border/70 bg-background px-2 py-1.5"
          }
        >
          <p className="text-[10px] text-muted-foreground">いま切っている音</p>
          {live.locked.length ? (
            <p className="text-[12px] font-semibold tabular-nums text-danger">
              {live.locked.map(formatHowlHz).join(" · ")}
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">鳴きなし</p>
          )}
          {live.rising.length > 0 && (
            <p className="mt-0.5 text-[10px] tabular-nums text-foreground">
              鳴きかけ {live.rising.map(formatHowlHz).join(" · ")}
            </p>
          )}
        </div>
      ) : null}
      {ROWS.map((row) => (
        <div key={row.key}>
          <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{row.label}</span>
            <span className="tabular-nums text-foreground">
              {Math.round(value[row.key] * 100)}%
            </span>
          </div>
          <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            {row.hint}
          </p>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(value[row.key] * 100)]}
            onValueChange={([n]) =>
              onChange({ ...value, [row.key]: (n ?? 0) / 100 })
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
        onClick={() => onChange({ ...DEFAULT_HOWL_TUNE })}
      >
        ハウリングキャンセラーの初期値に戻す
      </button>
    </div>
  );
}
