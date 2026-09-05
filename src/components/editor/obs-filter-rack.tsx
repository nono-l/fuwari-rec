import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  OBS_FILTER_CATALOG,
  recLabel,
  type ObsFilterId,
  type RecMark,
} from "@/lib/audio/obs-filters";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function db(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v} dB`;
}

export function ObsFilterRack() {
  const master = useEditorStore((s) => s.master);
  const setMaster = useEditorStore((s) => s.setMaster);

  const patch = (partial: Parameters<typeof setMaster>[0]) =>
    setMaster({ ...partial, preset: "original" });

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-foreground px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight text-background sm:text-base">
          音声フィルターの種類
        </h2>
        <p className="mt-0.5 text-[11px] text-background/75 sm:text-xs">
          まずは「なんのためのフィルターか」を把握しよう
        </p>
      </div>

      <div className="hidden grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(8rem,1.1fr)] gap-x-3 border-b border-border bg-muted/60 px-4 py-2 text-[11px] font-semibold text-muted-foreground sm:grid sm:px-5">
        <span>フィルター名</span>
        <span>おすすめ</span>
        <span>役割</span>
        <span>かかり具合</span>
      </div>

      <ul className="divide-y divide-border">
        {OBS_FILTER_CATALOG.map((row) => (
          <li key={row.id} className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name={row.name}
              rec={row.rec}
              role={row.role}
              bar={row.bar}
              control={
                <FilterControl
                  id={row.id}
                  masterVolume={master.volume}
                  noise={master.noise}
                  gate={master.gate}
                  eqLow={master.eqLow}
                  eqMid={master.eqMid}
                  eqHigh={master.eqHigh}
                  compressor={master.compressor}
                  upward={master.upward}
                  expander={master.expander}
                  limiter={master.limiter}
                  phaseInvert={master.phaseInvert}
                  onPatch={patch}
                />
              }
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-4 py-2.5 text-[10px] text-muted-foreground sm:px-5">
        <span>
          <span className="font-semibold text-primary">◎</span> おすすめ
        </span>
        <span>
          <span className="font-semibold text-success">○</span> 用途に応じて
        </span>
        <span>
          <span className="font-semibold">△</span> 基本不要・特殊用途
        </span>
      </div>
    </section>
  );
}

function FilterRow({
  name,
  rec,
  role,
  bar,
  control,
}: {
  name: string;
  rec: RecMark;
  role: string;
  bar: string;
  control: ReactNode;
}) {
  const badge = recLabel(rec);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(8rem,1.1fr)] sm:items-center sm:gap-x-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: bar }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-foreground">{name}</span>
      </div>
      <div className={cn("text-sm font-semibold", badge.className)} title={badge.text}>
        {badge.mark}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
        {role}
      </p>
      <div className="min-w-0">{control}</div>
    </div>
  );
}

function FilterControl({
  id,
  masterVolume,
  noise,
  gate,
  eqLow,
  eqMid,
  eqHigh,
  compressor,
  upward,
  expander,
  limiter,
  phaseInvert,
  onPatch,
}: {
  id: ObsFilterId;
  masterVolume: number;
  noise: number;
  gate: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  compressor: number;
  upward: number;
  expander: number;
  limiter: number;
  phaseInvert: boolean;
  onPatch: (p: {
    volume?: number;
    noise?: number;
    gate?: number;
    eqLow?: number;
    eqMid?: number;
    eqHigh?: number;
    compressor?: number;
    upward?: number;
    expander?: number;
    limiter?: number;
    phaseInvert?: boolean;
  }) => void;
}) {
  if (id === "vst") {
    return (
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        ブラウザでは読み込めません。下のスペクトラムフィルターを使ってください
      </p>
    );
  }
  if (id === "phase") {
    return (
      <Button
        type="button"
        size="sm"
        variant={phaseInvert ? "default" : "secondary"}
        aria-pressed={phaseInvert}
        onClick={() => onPatch({ phaseInvert: !phaseInvert })}
        className="w-full"
      >
        {phaseInvert ? "反転 ON" : "OFF"}
      </Button>
    );
  }
  if (id === "eq3") {
    return (
      <div className="space-y-1.5">
        <EqMini label="低" value={eqLow} onChange={(v) => onPatch({ eqLow: v })} />
        <EqMini label="中" value={eqMid} onChange={(v) => onPatch({ eqMid: v })} />
        <EqMini label="高" value={eqHigh} onChange={(v) => onPatch({ eqHigh: v })} />
      </div>
    );
  }
  if (id === "gain") {
    return (
      <Amount
        valueLabel={pct(masterVolume)}
        min={0}
        max={150}
        value={Math.round(masterVolume * 100)}
        onChange={(v) => onPatch({ volume: v / 100 })}
      />
    );
  }

  const map: Record<
    Exclude<ObsFilterId, "gain" | "eq3" | "phase" | "vst">,
    {
      value: number;
      key: "noise" | "gate" | "compressor" | "upward" | "expander" | "limiter";
    }
  > = {
    denoise: { value: noise, key: "noise" },
    gate: { value: gate, key: "gate" },
    compressor: { value: compressor, key: "compressor" },
    upward: { value: upward, key: "upward" },
    expander: { value: expander, key: "expander" },
    limiter: { value: limiter, key: "limiter" },
  };
  const row = map[id];
  return (
    <Amount
      valueLabel={row.value < 0.02 ? "オフ" : pct(row.value)}
      min={0}
      max={100}
      value={Math.round(row.value * 100)}
      onChange={(v) => onPatch({ [row.key]: v / 100 })}
    />
  );
}

function Amount({
  valueLabel,
  min,
  max,
  value,
  onChange,
}: {
  valueLabel: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-right text-[10px] tabular-nums text-foreground">
        {valueLabel}
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
      />
    </div>
  );
}

function EqMini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Slider
        min={-12}
        max={12}
        step={0.5}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-foreground">
        {db(value)}
      </span>
    </div>
  );
}
