import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  inspectAiSetup,
  inspectModelFile,
  inspectRuntimeSlot,
  roleLabel,
  type ModelInspect,
  type SetupCheck,
} from "@/lib/audio/ai-inspect";
import type { AiRuntimeSlotId } from "@/lib/audio/ai-runtime";
import { getAiModelFile } from "@/lib/audio/ai-voice";
import { useEditorStore } from "@/lib/store/editor-store";

function tone(fit: ModelInspect["fit"]) {
  if (fit === "ok") return "border-success/40 bg-success-soft text-success";
  if (fit === "empty") return "border-border bg-muted/40 text-muted-foreground";
  return "border-danger/40 bg-danger/10 text-danger";
}

function SlotResult({
  title,
  inspect,
}: {
  title: string;
  inspect: ModelInspect;
}) {
  const mark =
    inspect.fit === "ok" ? "使える" : inspect.fit === "empty" ? "未設定" : "使えない";
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-[11px] leading-relaxed", tone(inspect.fit))}>
      <div className="flex justify-between gap-2 font-medium">
        <span>{title}</span>
        <span>{mark}</span>
      </div>
      <p className="mt-0.5">{inspect.detail}</p>
      {inspect.role !== "unknown" && inspect.fit !== "empty" && (
        <p className="mt-0.5 opacity-80">判定: {roleLabel(inspect.role)}</p>
      )}
    </div>
  );
}

export function AiSetupCheck() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SetupCheck | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const voice = useEditorStore.getState().aiVoice;
      const file = voice ? getAiModelFile(voice.id) : null;
      setReport(await inspectAiSetup(file));
    } catch (e) {
      console.error(e);
      setReport({
        items: [],
        ok: false,
        summary: "調べられませんでした。ファイルを選び直してください",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? "調べています…" : "設定ファイルをチェック"}
      </Button>
      {report && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">{report.summary}</p>
          {report.items.map((item) => (
            <SlotResult
              key={item.slot}
              title={
                item.slot === "voice"
                  ? "エフェクターの声モデル"
                  : item.slot === "hubert"
                    ? "内容エンコーダ"
                    : item.slot === "rmvpe"
                      ? "ピッチ抽出"
                      : "学習の初期重み"
              }
              inspect={item.inspect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AiSlotCheck({ slot }: { slot: AiRuntimeSlotId }) {
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState<ModelInspect | null>(null);
  return (
    <div className="mt-2 space-y-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void inspectRuntimeSlot(slot)
            .then(setInspect)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "調べています…" : "このファイルを調べる"}
      </Button>
      {inspect && <SlotResult title="判定" inspect={inspect} />}
    </div>
  );
}

export function AiVoiceFileCheck({
  voiceId,
  file,
}: {
  voiceId: string;
  file: File | null;
}) {
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState<ModelInspect | null>(null);
  return (
    <div className="mt-2 space-y-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        disabled={busy || !file}
        onClick={() => {
          setBusy(true);
          void inspectModelFile(file ?? getAiModelFile(voiceId), "voice")
            .then(setInspect)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "調べています…" : "このモデルを調べる"}
      </Button>
      {inspect && <SlotResult title="声モデル" inspect={inspect} />}
    </div>
  );
}
