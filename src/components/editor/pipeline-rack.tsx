import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  extraPipelineBudget,
  cpuCores,
  DEFAULT_DUCK_TUNE,
  normalizeDuckTune,
} from "@/lib/audio/fx-pipeline";
import { CABLE_INDEXES, type CableIndex } from "@/lib/audio/cables";

export function PipelineTabs() {
  const extra = useEditorStore((s) => s.extraPipelines);
  const active = useEditorStore((s) => s.activePipelineId);
  const setActive = useEditorStore((s) => s.setActivePipelineId);
  const add = useEditorStore((s) => s.addExtraPipeline);
  const remove = useEditorStore((s) => s.removeExtraPipeline);
  const update = useEditorStore((s) => s.updateExtraPipeline);
  const budget = extraPipelineBudget();
  const cores = cpuCores();
  const maxPipes = budget + 1;
  const full = extra.length >= budget;
  const current = extra.find((p) => p.id === active) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setActive("main")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
            active === "main"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          1
        </button>
        {extra.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
              active === p.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
              !p.enabled && "opacity-50",
            )}
          >
            {p.number}
          </button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={full}
          onClick={() => add()}
          className="shrink-0 rounded-full"
        >
          <Plus className="size-3.5" />
          {full ? `上限${maxPipes}` : "追加"}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        タブは編集画面の切替です。パイプラインは同時に動きます。この端末は {cores}{" "}
        コア、同時 {maxPipes} 本まで。配線は仮想ケーブルで。
      </p>
      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={() => update(current.id, { enabled: !current.enabled })}
            />
            {current.name}
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            入力
            <select
              className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
              value={current.inputCable}
              onChange={(e) =>
                update(current.id, {
                  inputCable: Number(e.target.value) as CableIndex,
                })
              }
            >
              {CABLE_INDEXES.map((n) => (
                <option key={n} value={n}>
                  仮想ケーブル{n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            出力
            <select
              className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
              value={current.outputCable}
              onChange={(e) =>
                update(current.id, {
                  outputCable: Number(e.target.value) as CableIndex,
                })
              }
            >
              {CABLE_INDEXES.map((n) => (
                <option key={n} value={n}>
                  仮想ケーブル{n}戻り
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => remove(current.id)}
            aria-label="このパイプラインを削除"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
      {current && <DuckControls pipeId={current.id} duck={current.duck} />}
    </div>
  );
}

function DuckControls({
  pipeId,
  duck,
}: {
  pipeId: string;
  duck: ReturnType<typeof normalizeDuckTune> | undefined;
}) {
  const update = useEditorStore((s) => s.updateExtraPipeline);
  const value = normalizeDuckTune(duck);
  const patch = (partial: Partial<typeof value>) =>
    update(pipeId, { duck: { ...value, ...partial } });

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-2.5 py-2">
      <label className="flex items-start gap-2 text-[12px] font-medium text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.enabled}
          onChange={() => patch({ enabled: !value.enabled })}
        />
        <span>
          パイプライン1の声でダック
          <span className="mt-0.5 block text-[10px] font-normal leading-relaxed text-muted-foreground">
            このパイプラインの音（BGMなど）を、パイプライン1で話しているあいだ沈める
          </span>
        </span>
      </label>
      {value.enabled && (
        <div className="mt-2 space-y-2">
          <DuckRow
            label="スレッショルド"
            hint="この大きさ以上の声で沈み始める"
            valueLabel={`${value.thresholdDb.toFixed(0)} dB`}
            min={-60}
            max={-6}
            step={1}
            value={value.thresholdDb}
            onChange={(n) => patch({ thresholdDb: n })}
          />
          <DuckRow
            label="深さ"
            hint="声が出ているときの沈め方。上げすぎるとBGMが消える"
            valueLabel={`${Math.round(value.depth * 100)}%`}
            min={0}
            max={100}
            step={1}
            value={Math.round(value.depth * 100)}
            onChange={(n) => patch({ depth: n / 100 })}
          />
          <DuckRow
            label="アタック"
            hint="声が乗ってから沈むまでの速さ"
            valueLabel={`${Math.round(value.attackMs)} ms`}
            min={1}
            max={80}
            step={1}
            value={value.attackMs}
            onChange={(n) => patch({ attackMs: n })}
          />
          <DuckRow
            label="リリース"
            hint="話し終わってからBGMが戻る速さ"
            valueLabel={`${Math.round(value.releaseMs)} ms`}
            min={40}
            max={800}
            step={5}
            value={value.releaseMs}
            onChange={(n) => patch({ releaseMs: n })}
          />
          <button
            type="button"
            className="text-[10px] text-primary hover:underline"
            onClick={() => patch({ ...DEFAULT_DUCK_TUNE, enabled: true })}
          >
            ダックの初期値に戻す
          </button>
        </div>
      )}
    </div>
  );
}

function DuckRow({
  label,
  hint,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{valueLabel}</span>
      </div>
      <p className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([n]) => onChange(n ?? min)}
      />
    </div>
  );
}
