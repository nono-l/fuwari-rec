import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import { extraPipelineBudget } from "@/lib/audio/fx-pipeline";
import { type CableIndex } from "@/lib/audio/cables";

export function PipelineTabs() {
  const extra = useEditorStore((s) => s.extraPipelines);
  const active = useEditorStore((s) => s.activePipelineId);
  const setActive = useEditorStore((s) => s.setActivePipelineId);
  const add = useEditorStore((s) => s.addExtraPipeline);
  const remove = useEditorStore((s) => s.removeExtraPipeline);
  const update = useEditorStore((s) => s.updateExtraPipeline);
  const budget = extraPipelineBudget();
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
          {full ? `上限+${budget}` : "追加"}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        タブは編集画面の切替です。パイプラインは同時に動きます。配線は仮想ケーブルで。
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
              <option value={1}>仮想ケーブル1</option>
              <option value={2}>仮想ケーブル2</option>
              <option value={3}>仮想ケーブル3</option>
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
              <option value={1}>仮想ケーブル1戻り</option>
              <option value={2}>仮想ケーブル2戻り</option>
              <option value={3}>仮想ケーブル3戻り</option>
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
    </div>
  );
}
