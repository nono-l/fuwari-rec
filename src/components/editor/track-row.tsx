import {
  Circle,
  FolderOpen,
  Trash2,
  Volume2,
  VolumeX,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Waveform } from "@/components/editor/waveform";
import { useEditorStore } from "@/lib/store/editor-store";
import type { Track } from "@/lib/audio/types";
import { MEDIA_FILE_ACCEPT } from "@/lib/audio/media-decode";
import { cn } from "@/lib/utils";

export function TrackRow({ track }: { track: Track }) {
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const setActiveTrack = useEditorStore((s) => s.setActiveTrack);
  const updateTrack = useEditorStore((s) => s.updateTrack);
  const toggleMute = useEditorStore((s) => s.toggleMute);
  const toggleSolo = useEditorStore((s) => s.toggleSolo);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const loadFileToTrack = useEditorStore((s) => s.loadFileToTrack);
  const seek = useEditorStore((s) => s.seek);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const renameTrack = useEditorStore((s) => s.renameTrack);
  const isLoadingMedia = useEditorStore((s) => s.isLoadingMedia);

  const active = activeTrackId === track.id;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3 shadow-sm transition-colors sm:p-4",
        active ? "border-primary ring-1 ring-primary/20" : "border-border",
      )}
      onClick={() => setActiveTrack(track.id)}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: track.color }}
        />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
          value={track.name}
          onChange={(e) => renameTrack(track.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant={track.muted ? "secondary" : "ghost"}
            title="ミュート"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute(track.id);
            }}
          >
            {track.muted ? (
              <VolumeX className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={track.solo ? "default" : "ghost"}
            title="ソロ"
            onClick={(e) => {
              e.stopPropagation();
              toggleSolo(track.id);
            }}
          >
            <Headphones className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={active ? "default" : "ghost"}
            title="録音先に選択"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTrack(track.id);
            }}
          >
            <Circle className="size-3.5 fill-current" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            title="音声 / 動画 / MIDI 読み込み"
            disabled={isLoadingMedia}
            onClick={(e) => {
              e.stopPropagation();
              const input = document.createElement("input");
              input.type = "file";
              input.accept = MEDIA_FILE_ACCEPT;
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) void loadFileToTrack(track.id, file);
              };
              input.click();
            }}
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="削除"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`「${track.name}」を削除しますか？`)) {
                removeTrack(track.id);
              }
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <Waveform
        buffer={track.buffer}
        color={track.color}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">
            音量 {Math.round(track.volume * 100)}%
          </div>
          <Slider
            min={0}
            max={150}
            step={1}
            value={[Math.round(track.volume * 100)]}
            onValueChange={([v]) =>
              updateTrack(track.id, { volume: (v ?? 100) / 100 })
            }
          />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">
            パン{" "}
            {track.pan === 0
              ? "C"
              : track.pan > 0
                ? `R${Math.round(track.pan * 100)}`
                : `L${Math.round(-track.pan * 100)}`}
          </div>
          <Slider
            min={-100}
            max={100}
            step={1}
            value={[Math.round(track.pan * 100)]}
            onValueChange={([v]) =>
              updateTrack(track.id, { pan: (v ?? 0) / 100 })
            }
          />
        </div>
      </div>
    </div>
  );
}
