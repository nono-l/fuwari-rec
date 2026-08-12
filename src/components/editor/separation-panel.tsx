import { AudioLines, MicOff, Music2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";

export function SeparationPanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const isProcessing = useEditorStore((s) => s.isSeparating);
  const applySeparation = useEditorStore((s) => s.applySeparation);
  const restoreTrackBuffer = useEditorStore((s) => s.restoreTrackBuffer);
  const setActiveTrack = useEditorStore((s) => s.setActiveTrack);

  const active = tracks.find((t) => t.id === activeTrackId) ?? null;
  const canProcess = Boolean(active?.buffer);
  const canUndo = Boolean(active?.undoBuffer);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        ボーカル / 音源キャンセル
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        選択中トラックの<strong className="font-medium text-foreground">読み込み音源</strong>
        に対して、ステレオのセンター成分を分離します（古典的な mid/side 方式）。
        AI分離ではありません。YouTube埋め込み音声には適用できません。
      </p>

      <label className="mb-3 block text-xs font-medium text-muted-foreground">
        対象トラック
        <select
          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={activeTrackId ?? ""}
          onChange={(e) => setActiveTrack(e.target.value || null)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.buffer ? "" : "（音源なし）"}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-auto justify-start gap-3 rounded-xl px-3 py-3 text-left"
          disabled={!canProcess || isProcessing}
          onClick={() => void applySeparation("remove-vocals")}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <MicOff className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">
              ボーカルキャンセル
            </span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              センターの歌声を抑えてカラオケ寄りに
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="h-auto justify-start gap-3 rounded-xl px-3 py-3 text-left"
          disabled={!canProcess || isProcessing}
          onClick={() => void applySeparation("remove-instrumental")}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Music2 className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">
              音源キャンセル
            </span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              伴奏を抑え、中央のボーカル寄りを残す
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={!canUndo || isProcessing}
          onClick={() => restoreTrackBuffer()}
        >
          <RotateCcw className="size-3.5" />
          直前の音源に戻す
        </Button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <AudioLines className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {isProcessing
            ? "処理中…"
            : canProcess
              ? "ステレオ音源で効果が出やすいです。モノラルや左右に広がったボーカルは残りやすいです。"
              : "伴奏トラックなどにステレオ音源を読み込んでから実行してください。"}
        </span>
      </div>
    </section>
  );
}
