import { useEffect, useState } from "react";
import {
  Pause,
  Play,
  Square,
  Circle,
  Plus,
  FolderOpen,
  Download,
  Piano,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatTime } from "@/lib/utils";
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

  const [scrolled, setScrolled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState<boolean | null>(null);

  const showTools = toolsOpen ?? !scrolled;

  useEffect(() => {
    let ticking = false;

    const apply = () => {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setScrolled(y >= 24);
      if (y < 24) setToolsOpen(null);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const hint = recording
    ? statusMessage
    : statusMessage ||
      "赤い「録音」を押すと時間が進み、もう一度押すと止まります";

  return (
    <div
      id="transport-bar"
      className={cn(
        "sticky top-[calc(var(--grok-banner-h,0px)+3.5rem)] z-30 -mx-4 mb-3 border-y border-border bg-background/92 px-4 shadow-sm backdrop-blur-md sm:-mx-6 sm:px-6",
        showTools ? "py-2.5" : "py-1.5 sm:py-2.5",
      )}
    >
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
          className={
            recording ? "animate-pulse min-w-[5.5rem]" : "min-w-[5.5rem]"
          }
        >
          <Circle className="size-3.5 fill-current" />
          {recording ? "停止" : "録音"}
        </Button>

        <div
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums sm:px-3 sm:py-2 sm:text-sm",
            recording ? "bg-danger/15 text-danger" : "bg-muted text-foreground",
          )}
        >
          {recording ? `REC ${formatTime(currentTime)}` : formatTime(currentTime)}
        </div>

        <Badge
          variant={recording ? "danger" : playing ? "success" : "secondary"}
          className="shrink-0"
        >
          {recording ? "REC" : playing ? "PLAY" : "STOP"}
        </Badge>

        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
          {hint}
        </p>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="ml-auto shrink-0 sm:hidden"
          onPointerDown={(e) => {
            e.preventDefault();
            setToolsOpen(!showTools);
          }}
          aria-expanded={showTools}
          aria-controls="transport-tools"
          title={showTools ? "ツールをしまう" : "BPM・読み込みなどを表示"}
          aria-label={showTools ? "ツールをしまう" : "BPM・読み込みなどを表示"}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              showTools && "rotate-180",
            )}
          />
        </Button>
      </div>

      <div
        id="transport-tools"
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out sm:grid-rows-[1fr] sm:opacity-100",
          showTools
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
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
          </div>
        </div>
      </div>
    </div>
  );
}
