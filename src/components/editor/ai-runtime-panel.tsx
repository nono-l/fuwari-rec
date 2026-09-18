import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Check, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AI_RUNTIME_SLOTS,
  aiRuntimeModeLabel,
  type AiRuntimeSlotDef,
} from "@/lib/audio/ai-runtime";
import { formatModelSize } from "@/lib/audio/ai-voice";
import { useAiRuntimeStore } from "@/lib/store/ai-runtime-store";
import { WebGpuToggle } from "@/components/editor/webgpu-toggle";
import { AiSetupCheck, AiSlotCheck } from "@/components/editor/ai-file-check";

export function AiRuntimePanel() {
  const hydrate = useAiRuntimeStore((s) => s.hydrate);
  const hydrated = useAiRuntimeStore((s) => s.hydrated);
  const slots = useAiRuntimeStore((s) => s.slots);
  const mode = useAiRuntimeStore((s) => s.mode);
  const busy = useAiRuntimeStore((s) => s.busy);
  const error = useAiRuntimeStore((s) => s.error);
  const setFile = useAiRuntimeStore((s) => s.setFile);
  const clearFile = useAiRuntimeStore((s) => s.clearFile);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-foreground px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight text-background sm:text-base">
            公式の土台
          </h2>
          <p className="mt-0.5 text-[11px] text-background/75 sm:text-xs">
            誰の声でもない共通モデルです。変換には .onnx が必要です。.pt では素通りです
          </p>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div
            className={cn(
              "rounded-xl border px-3 py-2.5 text-sm",
              mode === "ready"
                ? "border-success/40 bg-success-soft text-success"
                : "border-border bg-muted/40 text-foreground",
            )}
          >
            <div className="font-medium">{aiRuntimeModeLabel(mode)}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              声色はエフェクターのAIボイスで .onnx を選びます。.pt / .pth はブラウザでは動きません。
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {!hydrated && (
            <p className="text-xs text-muted-foreground">読み込み中…</p>
          )}
          <WebGpuToggle />
          <AiSetupCheck />
          <ul className="space-y-3">
            {AI_RUNTIME_SLOTS.map((def) => (
              <li key={def.id}>
                <SlotCard
                  def={def}
                  meta={slots[def.id]}
                  busy={busy === def.id}
                  onPick={(f) => void setFile(def.id, f)}
                  onClear={() => void clearFile(def.id)}
                />
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            ブラウザで変換できるのは .onnx だけです。内容エンコーダは{" "}
            <a
              href="https://huggingface.co/wok000/vcclient_modules/blob/main/contentvec/contentvec-f.onnx"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              contentvec-f.onnx
            </a>
            、ピッチは{" "}
            <a
              href="https://huggingface.co/lj1995/VoiceConversionWebUI/blob/main/rmvpe.onnx"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              rmvpe.onnx
            </a>
            （公式）。hubert_base.pt は学習用なので使いません。この端末にだけ保存します。
          </p>
          <Link
            to="/effector"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            エフェクターのAIボイスへ
          </Link>
        </div>
      </section>
    </div>
  );
}

function SlotCard({
  def,
  meta,
  busy,
  onPick,
  onClear,
}: {
  def: AiRuntimeSlotDef;
  meta: { name: string; bytes: number } | null;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onnx = Boolean(meta && /\.onnx$/i.test(meta.name));
  return (
    <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
            onnx ? "bg-success text-background" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {onnx ? <Check className="size-3" /> : <span className="text-[10px]">—</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-semibold text-foreground">{def.label}</h3>
            {def.optional && (
              <span className="text-[10px] text-muted-foreground">任意</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {def.role}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={def.accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />

      {meta ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-foreground">
              {meta.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatModelSize(meta.bytes) || "保存済み"}
              {/\.onnx$/i.test(meta.name)
                ? " · 変換に使えます"
                : " · .pt は学習用。変換には .onnx が必要です"}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            変更
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            onClick={onClear}
            aria-label="外す"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 w-full justify-center"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpen className="size-3.5" />
          {busy ? "保存中…" : "ファイルを選ぶ"}
        </Button>
      )}

      <AiSlotCheck slot={def.id} />

      <a
        href={def.officialUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        公式: {def.officialName}
      </a>
    </div>
  );
}
