import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  AUTOTUNE_KEYS,
  DEFAULT_AUTOTUNE_TUNE,
  type AutotuneScale,
  type AutotuneTune,
} from "@/lib/audio/spectrum-filters";
import {
  readAutotune,
  subscribeAutotune,
  type AutotuneLive,
} from "@/lib/audio/autotune-report";
import { cn } from "@/lib/utils";

const SCALES: { id: AutotuneScale; label: string }[] = [
  { id: "chromatic", label: "半音" },
  { id: "major", label: "長調" },
  { id: "minor", label: "短調" },
];

const GRAINS = [512, 1024, 2048] as const;

export function AutotuneTuneControls({
  insertId,
  value,
  onChange,
}: {
  insertId?: string;
  value: AutotuneTune;
  onChange: (next: AutotuneTune) => void;
}) {
  const [live, setLive] = useState<AutotuneLive | null>(null);
  useEffect(() => {
    if (!insertId) return;
    const pull = () => setLive(readAutotune(insertId));
    pull();
    return subscribeAutotune(pull);
  }, [insertId]);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      {insertId ? (
        <div className="rounded-md border border-border/70 bg-background px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground">いまの声 → 吸着先</p>
          {live ? (
            <p className="text-[12px] font-semibold tabular-nums text-foreground">
              {live.note} → {live.target}
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                {live.cents > 0.5 ? "+" : ""}
                {live.cents.toFixed(0)} cent
              </span>
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">声待ち</p>
          )}
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground">キー</p>
        <div className="flex flex-wrap gap-1">
          {AUTOTUNE_KEYS.map((name, i) => (
            <button
              key={name}
              type="button"
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                value.key === i
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground",
              )}
              onClick={() => onChange({ ...value, key: i })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground">スケール</p>
        <div className="flex flex-wrap gap-1">
          {SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                value.scale === s.id
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground",
              )}
              onClick={() => onChange({ ...value, scale: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>吸いつき</span>
          <span className="tabular-nums text-foreground">
            {Math.round(value.strength * 100)}%
          </span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          キーの音にどれだけ寄せるか。上げすぎるとロボットになります
        </p>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(value.strength * 100)]}
          onValueChange={([n]) =>
            onChange({ ...value, strength: (n ?? 0) / 100 })
          }
        />
      </div>
      <div>
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>速さ</span>
          <span className="tabular-nums text-foreground">
            {Math.round(value.speed * 100)}%
          </span>
        </div>
        <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
          音が変わるときの寄り方。速いと段がはっきりします
        </p>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(value.speed * 100)]}
          onValueChange={([n]) =>
            onChange({ ...value, speed: (n ?? 0) / 100 })
          }
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground">粒（遅延）</p>
        <div className="flex flex-wrap gap-1">
          {GRAINS.map((g) => (
            <button
              key={g}
              type="button"
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                value.grain === g
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground",
              )}
              onClick={() => onChange({ ...value, grain: g })}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="text-[10px] text-primary hover:underline"
        onClick={() => onChange({ ...DEFAULT_AUTOTUNE_TUNE })}
      >
        キー吸着の初期値に戻す
      </button>
    </div>
  );
}
