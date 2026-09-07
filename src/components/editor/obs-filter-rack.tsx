import { Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  MAX_OBS_INSERTS,
  OBS_FILTER_CATALOG,
  recLabel,
  type ObsFilterId,
  type ObsInsert,
  type RecMark,
} from "@/lib/audio/obs-filters";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function db(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v} dB`;
}

export function insertSummary(ins: ObsInsert) {
  if (ins.kind === "phase") return ins.phaseInvert ? "反転 ON" : "OFF";
  if (ins.kind === "eq3") {
    return `低 ${db(ins.eqLow)} · 中 ${db(ins.eqMid)} · 高 ${db(ins.eqHigh)}`;
  }
  if (ins.kind === "howl") {
    return ins.amount < 0.03 ? "オフ" : `自動 · ${pct(ins.amount)}`;
  }
  if (ins.kind === "gain") return pct(ins.amount);
  return ins.amount < 0.02 ? "オフ" : pct(ins.amount);
}

export function ObsFilterRack() {
  const inserts = useEditorStore((s) => s.obsInserts);
  const addObsInsert = useEditorStore((s) => s.addObsInsert);
  const full = inserts.length >= MAX_OBS_INSERTS;

  const insert = (kind: ObsFilterId) => {
    addObsInsert(kind);
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-foreground px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight text-background sm:text-base">
            音声フィルターの種類
          </h2>
          <p className="mt-0.5 text-[11px] text-background/75 sm:text-xs">
            説明を見て、上のライブエフェクターのリストへ挿入する。同じ種類は何段でも置ける
          </p>
        </div>

        <div className="hidden grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(7.5rem,0.9fr)] gap-x-3 border-b border-border bg-muted/60 px-4 py-2 text-[11px] font-semibold text-muted-foreground sm:grid sm:px-5">
          <span>フィルター名</span>
          <span>おすすめ</span>
          <span>役割</span>
          <span>ライブへ</span>
        </div>

        <ul className="divide-y divide-border">
          {OBS_FILTER_CATALOG.map((row) => {
            const count = inserts.filter((f) => f.kind === row.id).length;
            return (
              <li key={row.id} className="px-3 py-3 sm:px-5 sm:py-3.5">
                <FilterRow
                  name={row.name}
                  rec={row.rec}
                  role={row.role}
                  bar={row.bar}
                  control={
                    <div className="flex flex-col items-stretch gap-1 sm:items-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={count ? "secondary" : "default"}
                        disabled={full}
                        onClick={() => insert(row.id)}
                        className="w-full"
                      >
                        <Plus className="size-3.5" />
                        {count === 0
                          ? "ライブに挿入"
                          : `${count + 1}段目を挿入`}
                      </Button>
                      {count > 0 && (
                        <span className="text-right text-[10px] tabular-nums text-muted-foreground">
                          {count}段 挿入中
                        </span>
                      )}
                    </div>
                  }
                />
              </li>
            );
          })}
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
          <span>ゲインは前段トリム＋後段メイクアップ、の2段が定番です</span>
        </div>
      </section>
    </div>
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
  control: React.ReactNode;
}) {
  const badge = recLabel(rec);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(7.5rem,0.9fr)] sm:items-center sm:gap-x-3">
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

export function InsertControl({
  insert,
  onPatch,
}: {
  insert: ObsInsert;
  onPatch: (p: Partial<ObsInsert>) => void;
}) {
  if (insert.kind === "phase") {
    return (
      <Button
        type="button"
        size="sm"
        variant={insert.phaseInvert ? "default" : "secondary"}
        aria-pressed={insert.phaseInvert}
        onClick={() => onPatch({ phaseInvert: !insert.phaseInvert })}
        className="w-full"
      >
        {insert.phaseInvert ? "反転 ON" : "OFF"}
      </Button>
    );
  }
  if (insert.kind === "eq3") {
    return (
      <div className="space-y-1.5">
        <EqMini
          label="低"
          value={insert.eqLow}
          onChange={(v) => onPatch({ eqLow: v })}
        />
        <EqMini
          label="中"
          value={insert.eqMid}
          onChange={(v) => onPatch({ eqMid: v })}
        />
        <EqMini
          label="高"
          value={insert.eqHigh}
          onChange={(v) => onPatch({ eqHigh: v })}
        />
      </div>
    );
  }
  if (insert.kind === "gain") {
    return (
      <Amount
        valueLabel={pct(insert.amount)}
        min={0}
        max={150}
        value={Math.round(insert.amount * 100)}
        onChange={(v) => onPatch({ amount: v / 100 })}
      />
    );
  }
  if (insert.kind === "howl") {
    return (
      <div>
        <Amount
          valueLabel={insert.amount < 0.03 ? "オフ" : pct(insert.amount)}
          min={0}
          max={100}
          value={Math.round(insert.amount * 100)}
          onChange={(v) => onPatch({ amount: v / 100 })}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          持続するピークを自動で切る。効きを上げるとノッチが増えて鋭くなる
        </p>
      </div>
    );
  }
  return (
    <Amount
      valueLabel={insert.amount < 0.02 ? "オフ" : pct(insert.amount)}
      min={0}
      max={100}
      value={Math.round(insert.amount * 100)}
      onChange={(v) => onPatch({ amount: v / 100 })}
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
