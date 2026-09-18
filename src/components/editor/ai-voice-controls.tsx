import { useRef, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  AI_MODEL_ACCEPT,
  formatModelSize,
  hasAiModelFile,
  setAiModelFile,
  type AiVoiceInsert,
} from "@/lib/audio/ai-voice";
import { getAiConvertRuntime } from "@/lib/audio/ai-convert-runtime";
import { aiRuntimeModeLabel } from "@/lib/audio/ai-runtime";
import { useAiRuntimeStore } from "@/lib/store/ai-runtime-store";
import { WebGpuToggle } from "@/components/editor/webgpu-toggle";
import { AiVoiceMeter } from "@/components/editor/ai-voice-meter";

export function AiVoiceControl({
  voice,
  onPatch,
  onClearModel,
}: {
  voice: AiVoiceInsert;
  onPatch: (p: Partial<AiVoiceInsert>) => void;
  onClearModel?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const loaded = hasAiModelFile(voice.id, voice.modelName);
  const named = voice.modelName.trim();
  const mode = useAiRuntimeStore((s) => s.mode);
  const convert = useSyncExternalStore(
    (cb) => getAiConvertRuntime().subscribe(cb),
    () => getAiConvertRuntime().getState(),
    () => getAiConvertRuntime().getState(),
  );

  const pick = (file: File | null) => {
    if (!file) return;
    setAiModelFile(voice.id, file);
    onPatch({ modelName: file.name, modelBytes: file.size });
  };

  const clear = () => {
    setAiModelFile(voice.id, null);
    onPatch({ modelName: "", modelBytes: 0 });
    if (inputRef.current) inputRef.current.value = "";
    onClearModel?.();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
        <div className="text-[11px] font-medium text-foreground">
          公式の土台
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {aiRuntimeModeLabel(mode)}
        </p>
        <Link
          to="/AI"
          className="mt-1 inline-block text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          AIタブで設定
        </Link>
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-medium text-foreground">
          声モデル
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={AI_MODEL_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
          }}
        />
        {named ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">
                {named}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatModelSize(voice.modelBytes) || "サイズ不明"}
                {loaded ? " · この端末に保持" : " · ファイルを再選択してください"}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              変更
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={clear}
              aria-label="モデルを外す"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen className="size-3.5" />
            モデルを選ぶ
          </Button>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          .onnx だけが声変換します。.pth / .pt は素通りです。
          {convert.detail ? ` ${convert.detail}` : ""}
        </p>
        <div className="mt-2">
          <WebGpuToggle />
        </div>
        <div className="mt-2">
          <AiVoiceMeter convert={convert} mix={voice.mix} />
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
          <span>変換の割合</span>
          <span className="tabular-nums text-foreground">
            {Math.round(voice.mix * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(voice.mix * 100)]}
          onValueChange={([n]) => onPatch({ mix: (n ?? 100) / 100 })}
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
          <span>キー（半音）</span>
          <span className="tabular-nums text-foreground">
            {voice.pitch > 0 ? "+" : ""}
            {voice.pitch.toFixed(1)}
          </span>
        </div>
        <Slider
          min={-120}
          max={120}
          step={1}
          value={[Math.round(voice.pitch * 10)]}
          onValueChange={([n]) => onPatch({ pitch: (n ?? 0) / 10 })}
        />
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        上の段が前処理、この段で声色を渡す、下が変換後です。一段まで。
      </p>
    </div>
  );
}
