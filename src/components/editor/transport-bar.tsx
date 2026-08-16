import {
  Pause,
  Play,
  Square,
  Circle,
  Plus,
  FolderOpen,
  Download,
  Piano,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import { MEDIA_FILE_ACCEPT } from "@/lib/audio/media-decode";

export function TransportBar() {
  const status = useEditorStore((s) => s.status);
  const currentTime = useEditorStore((s) => s.currentTime);
  const bpm = useEditorStore((s) => s.bpm);
  const statusMessage = useEditorStore((s) => s.statusMessage);
  const isExporting = useEditorStore((s) => s.isExporting);
  const isLoadingMidi = useEditorStore((s) => s.isLoadingMidi);
  const isLoadingMedia = useEditorStore((s) => s.isLoadingMedia);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const stop = useEditorStore((s) => s.stop);
  const toggleRecord = useEditorStore((s) => s.toggleRecord);
  const addTrack = useEditorStore((s) => s.addTrack);
  const loadFileToTrack = useEditorStore((s) => s.loadFileToTrack);
  const loadMidiToTrack = useEditorStore((s) => s.loadMidiToTrack);
  const exportWav = useEditorStore((s) => s.exportWav);
  const setBpm = useEditorStore((s) => s.setBpm);

  const recording = status === "recording";
  const playing = status === "playing";

  const pickMedia = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MEDIA_FILE_ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void loadFileToTrack(null, file);
    };
    input.click();
  };

  const pickMidi = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mid,.midi,audio/midi,audio/mid";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void loadMidiToTrack(null, file);
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={stop}
          title="停止"
          aria-label="停止"
        >
          <Square className="size-4 fill-current" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="default"
          onClick={togglePlay}
          disabled={recording}
          title={playing ? "一時停止" : "再生"}
          aria-label={playing ? "一時停止" : "再生"}
        >
          {playing ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </Button>
        <Button
          type="button"
          variant={recording ? "danger" : "record"}
          onClick={() => void toggleRecord()}
          title={recording ? "録音停止" : "録音開始（時間が進みます）"}
          aria-label={recording ? "録音停止" : "録音開始"}
          aria-pressed={recording}
          className={recording ? "animate-pulse min-w-[5.5rem]" : "min-w-[5.5rem]"}
        >
          <Circle className="size-3.5 fill-current" />
          {recording ? "停止" : "録音"}
        </Button>
      </div>

      <div
        className={
          recording
            ? "rounded-full bg-danger/15 px-3 py-2 font-mono text-sm font-semibold tabular-nums text-danger"
            : "rounded-full bg-muted px-3 py-2 font-mono text-sm font-semibold tabular-nums text-foreground"
        }
      >
        {recording ? `REC ${formatTime(currentTime)}` : formatTime(currentTime)}
      </div>

      <label className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <span>BPM</span>
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value) || 120)}
          className="w-12 bg-transparent text-center font-semibold tabular-nums text-foreground outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => addTrack()}
        >
          <Plus className="size-3.5" />
          トラック
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isLoadingMedia}
          onClick={pickMedia}
          title="音声・動画・MIDI を読み込み（動画は音声のみ取り込み）"
        >
          <FolderOpen className="size-3.5" />
          {isLoadingMedia ? "変換中…" : "読み込み"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isLoadingMidi}
          onClick={pickMidi}
          title="MIDI ファイルを読み込んで再生"
          aria-label="MIDI"
        >
          <Piano className="size-3.5" />
          {isLoadingMidi ? "MIDI変換中…" : "MIDI"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={isExporting}
          onClick={() => void exportWav()}
        >
          <Download className="size-3.5" />
          {isExporting ? "書き出し中…" : "WAV書き出し"}
        </Button>
      </div>

      <div className="flex w-full items-center gap-2 sm:order-last">
        <Badge
          variant={recording ? "danger" : playing ? "success" : "secondary"}
        >
          {recording ? "REC" : playing ? "PLAY" : "STOP"}
        </Badge>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {recording
            ? statusMessage
            : statusMessage ||
              "赤い「録音」を押すと時間が進み、もう一度押すと止まります"}
        </p>
      </div>
    </div>
  );
}
