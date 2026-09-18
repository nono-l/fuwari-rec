import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SCENES, type SceneId } from "@/lib/audio/scenes";
import { obsOverlayUrl } from "@/lib/audio/obs-overlay-bus";
import { RemoteHost } from "@/components/editor/remote-host";
import { useEditorStore } from "@/lib/store/editor-store";

export function SceneBar({ compact = false }: { compact?: boolean }) {
  const active = useEditorStore((s) => s.activeSceneId);
  const bank = useEditorStore((s) => s.sceneBank);
  const recall = useEditorStore((s) => s.recallScene);
  const capture = useEditorStore((s) => s.captureScene);
  const reset = useEditorStore((s) => s.resetScene);
  const [copied, setCopied] = useState(false);

  const copyObs = async () => {
    try {
      await navigator.clipboard.writeText(obsOverlayUrl());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {SCENES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => recall(sc.id)}
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold sm:px-2.5",
              active === sc.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
            title={`${sc.label}（キー ${sc.key}）`}
          >
            {sc.key} {sc.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <div className="text-[12px] font-medium text-foreground">シーン</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        キー 1・2・3 で切替。パイプライン1の音声と、各パイプラインのオン／中身をまとめて読み出します。配線はそのままです
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SCENES.map((sc) => {
          const saved = Boolean(bank[sc.id]);
          const on = active === sc.id;
          return (
            <div key={sc.id} className="min-w-0">
              <button
                type="button"
                onClick={() => recall(sc.id as SceneId)}
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-left transition-colors",
                  on
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary hover:bg-primary/5",
                )}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-[13px] font-semibold text-foreground">
                    {sc.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {sc.key}
                  </span>
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                  {saved ? "記憶した内容" : sc.hint}
                </span>
              </button>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => capture(sc.id)}
                >
                  記憶
                </Button>
                {saved && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => reset(sc.id)}
                  >
                    初期
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RemoteHost />
        <Button type="button" size="sm" variant="secondary" onClick={() => void copyObs()}>
          OBSソース
        </Button>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {copied
            ? "URL をコピーしました。OBS のブラウザソースに貼って、背景を透明に"
            : "このタブを開いたまま、OBS へブラウザソースとして追加します"}
        </p>
      </div>
    </div>
  );
}
