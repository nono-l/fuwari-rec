import { useMemo, useRef } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Music2,
  Plus,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import { midiToNoteName } from "@/lib/audio/pitch";
import {
  COLS,
  DRAW_LENGTHS,
  GRID_BEAT,
  VIEW_ROWS,
  WINDOW_BARS,
  WINDOW_BEATS,
  isBlackKey,
  secToBeat,
  snapBeat,
  totalBeats,
} from "@/lib/audio/midi-edit";
import type { MidiNote } from "@/lib/audio/midi";
import type { Track } from "@/lib/audio/types";

function barsLabel(startBeat: number) {
  const a = Math.floor(startBeat / WINDOW_BEATS) * WINDOW_BARS + 1;
  return `${a}–${a + WINDOW_BARS - 1} 小節`;
}

export function PianoRollPanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const midiTracks = tracks.filter(
    (t) => t.kind === "midi" || (t.midiNotes?.length ?? 0) > 0,
  );
  const editId = useEditorStore((s) => s.midiEditTrackId);
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const bpm = useEditorStore((s) => s.bpm);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const windowBeat = useEditorStore((s) => s.midiWindowBeat);
  const drawBeats = useEditorStore((s) => s.midiDrawBeats);
  const viewLow = useEditorStore((s) => s.midiViewLow);
  const cursorBeat = useEditorStore((s) => s.midiCursorBeat);
  const cursorPitch = useEditorStore((s) => s.midiCursorPitch);
  const undoLen = useEditorStore((s) => s.midiUndo.length);
  const status = useEditorStore((s) => s.status);
  const openMidiEditor = useEditorStore((s) => s.openMidiEditor);
  const createMidiTrack = useEditorStore((s) => s.createMidiTrack);
  const setMidiWindowBeat = useEditorStore((s) => s.setMidiWindowBeat);
  const setMidiDrawBeats = useEditorStore((s) => s.setMidiDrawBeats);
  const shiftMidiViewOctave = useEditorStore((s) => s.shiftMidiViewOctave);
  const setMidiCursor = useEditorStore((s) => s.setMidiCursor);
  const toggleMidiCell = useEditorStore((s) => s.toggleMidiCell);
  const undoMidiEdit = useEditorStore((s) => s.undoMidiEdit);
  const seekToBeat = useEditorStore((s) => s.seekToBeat);
  const togglePlay = useEditorStore((s) => s.togglePlay);

  const selected =
    midiTracks.find((t) => t.id === editId) ??
    midiTracks.find((t) => t.id === activeTrackId) ??
    midiTracks[0] ??
    null;

  const notes = selected?.midiNotes ?? [];
  const maxBeat = totalBeats(notes, bpm, duration);
  const maxWindow = Math.max(0, snapWindowFloor(maxBeat - WINDOW_BEATS));

  const playBeat = secToBeat(currentTime, bpm);
  const inWindow = playBeat >= windowBeat && playBeat < windowBeat + WINDOW_BEATS;

  if (midiTracks.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-dashed border-border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Music2 className="size-4 text-primary" />
          MIDI 編集
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          アレンジメントとピアノロールで音符を置きます。歌の MIDI
          化、ファイル読み込み、または空のトラックから書けます。
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={() => createMidiTrack()}
        >
          <Plus className="size-3.5" />
          空の MIDI トラック
        </Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Music2 className="size-4 text-primary" />
            アレンジメント
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {Math.ceil(maxBeat / BEATS_SAFE)} 小節 · {midiTracks.length} MIDI トラック · グリッド 1/16
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => createMidiTrack()}>
          <Plus className="size-3.5" />
          MIDI
        </Button>
      </div>

      <Arrangement
        tracks={midiTracks}
        selectedId={selected?.id ?? null}
        bpm={bpm}
        maxBeat={maxBeat}
        playBeat={playBeat}
        windowBeat={windowBeat}
        onSelect={(id, beat) => {
          openMidiEditor(id);
          if (beat != null) seekToBeat(beat);
        }}
      />

      {selected && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {selected.name}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  ピアノロール
                </span>
              </h3>
              <p className="text-[10px] text-muted-foreground">
                クリックで追加・削除 · 矢印で移動 · Enter で置く · Space で再生
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={windowBeat <= 0}
                onClick={() => setMidiWindowBeat(windowBeat - WINDOW_BEATS)}
                aria-label="前の4小節"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[5.5rem] text-center text-[11px] tabular-nums text-foreground">
                {barsLabel(windowBeat)}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={windowBeat >= maxWindow && maxWindow > 0}
                onClick={() => setMidiWindowBeat(windowBeat + WINDOW_BEATS)}
                aria-label="次の4小節"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-y border-border bg-muted/30 px-3 py-2 sm:px-4">
            <span className="text-[10px] font-medium text-muted-foreground">
              追加する音符の長さ
            </span>
            <div className="flex flex-wrap gap-1">
              {DRAW_LENGTHS.map((d) => (
                <Button
                  key={d.beats}
                  type="button"
                  size="sm"
                  variant={drawBeats === d.beats ? "default" : "secondary"}
                  onClick={() => setMidiDrawBeats(d.beats)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={undoLen === 0}
              onClick={() => undoMidiEdit()}
            >
              <Undo2 className="size-3.5" />
              戻す
            </Button>
          </div>

          <PianoGrid
            track={selected}
            notes={notes}
            bpm={bpm}
            windowBeat={windowBeat}
            viewLow={viewLow}
            cursorBeat={cursorBeat}
            cursorPitch={cursorPitch}
            playBeat={inWindow ? playBeat : null}
            playing={status === "playing" || status === "recording"}
            onCursor={setMidiCursor}
            onToggle={(beat, pitch) => toggleMidiCell(selected.id, beat, pitch)}
            onPlayToggle={togglePlay}
            onOctave={shiftMidiViewOctave}
            onSeekBeat={(beat) => seekToBeat(beat)}
          />
        </div>
      )}
    </section>
  );
}

const BEATS_SAFE = WINDOW_BEATS / WINDOW_BARS;

function snapWindowFloor(beat: number) {
  return Math.max(0, Math.floor(beat / WINDOW_BEATS) * WINDOW_BEATS);
}

function Arrangement({
  tracks,
  selectedId,
  bpm,
  maxBeat,
  playBeat,
  windowBeat,
  onSelect,
}: {
  tracks: Track[];
  selectedId: string | null;
  bpm: number;
  maxBeat: number;
  playBeat: number;
  windowBeat: number;
  onSelect: (id: string, beat?: number) => void;
}) {
  const bars = Math.max(WINDOW_BARS, Math.ceil(maxBeat / BEATS_SAFE));
  const sections = Math.ceil(bars / WINDOW_BARS);
  return (
    <div className="overflow-x-auto px-3 py-3 sm:px-4">
      <div className="mb-1 flex min-w-[36rem] gap-0.5 pl-[5.5rem] text-[10px] text-muted-foreground">
        {Array.from({ length: sections }, (_, i) => (
          <button
            key={i}
            type="button"
            className={cn(
              "flex-1 rounded-md px-1 py-0.5 text-left hover:bg-muted",
              windowBeat === i * WINDOW_BEATS && "bg-primary/15 font-semibold text-foreground",
            )}
            onClick={() => {
              const beat = i * WINDOW_BEATS;
              if (selectedId) onSelect(selectedId, beat);
            }}
          >
            {i * WINDOW_BARS + 1}–{i * WINDOW_BARS + WINDOW_BARS}
          </button>
        ))}
      </div>
      <div className="min-w-[36rem] space-y-1">
        {tracks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id, windowBeat)}
            className={cn(
              "flex w-full items-stretch gap-2 rounded-xl border px-2 py-1.5 text-left",
              t.id === selectedId
                ? "border-primary bg-primary/8"
                : "border-border bg-background hover:bg-muted/50",
            )}
          >
            <span className="w-[4.6rem] shrink-0 truncate pt-1 text-[11px] font-medium text-foreground">
              {t.name}
            </span>
            <MiniLane
              notes={t.midiNotes ?? []}
              color={t.color}
              bpm={bpm}
              maxBeat={Math.max(maxBeat, sections * WINDOW_BEATS)}
              playBeat={playBeat}
              windowBeat={windowBeat}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniLane({
  notes,
  color,
  bpm,
  maxBeat,
  playBeat,
  windowBeat,
}: {
  notes: MidiNote[];
  color: string;
  bpm: number;
  maxBeat: number;
  playBeat: number;
  windowBeat: number;
}) {
  const span = Math.max(WINDOW_BEATS, maxBeat);
  return (
    <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/60">
      <div
        className="absolute inset-y-0 bg-primary/10"
        style={{
          left: `${(windowBeat / span) * 100}%`,
          width: `${(WINDOW_BEATS / span) * 100}%`,
        }}
      />
      {notes.map((n, i) => {
        const start = secToBeat(n.start, bpm);
        const dur = Math.max(GRID_BEAT, secToBeat(n.duration, bpm));
        const y = 1 - ((n.midi - 24) / 84);
        return (
          <span
            key={n.id ?? `${i}-${n.midi}`}
            className="absolute h-1 rounded-sm"
            style={{
              left: `${(start / span) * 100}%`,
              width: `${(dur / span) * 100}%`,
              top: `${Math.max(8, Math.min(88, y * 100))}%`,
              background: color,
              opacity: 0.85,
            }}
          />
        );
      })}
      <div
        className="absolute inset-y-0 w-px bg-primary"
        style={{ left: `${(playBeat / span) * 100}%` }}
      />
    </div>
  );
}

function PianoGrid({
  track,
  notes,
  bpm,
  windowBeat,
  viewLow,
  cursorBeat,
  cursorPitch,
  playBeat,
  playing,
  onCursor,
  onToggle,
  onPlayToggle,
  onOctave,
  onSeekBeat,
}: {
  track: Track;
  notes: MidiNote[];
  bpm: number;
  windowBeat: number;
  viewLow: number;
  cursorBeat: number;
  cursorPitch: number;
  playBeat: number | null;
  playing: boolean;
  onCursor: (beat: number, pitch: number) => void;
  onToggle: (beat: number, pitch: number) => void;
  onPlayToggle: () => void;
  onOctave: (d: -1 | 1) => void;
  onSeekBeat: (beat: number) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pitches = useMemo(
    () => Array.from({ length: VIEW_ROWS }, (_, i) => viewLow + VIEW_ROWS - 1 - i),
    [viewLow],
  );
  const windowNotes = notes.filter((n) => {
    const s = secToBeat(n.start, bpm);
    const e = s + secToBeat(n.duration, bpm);
    return e > windowBeat && s < windowBeat + WINDOW_BEATS;
  });

  const cellFromPoint = (clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    const col = Math.max(
      0,
      Math.min(COLS - 1, Math.floor(((clientX - r.left) / r.width) * COLS)),
    );
    const row = Math.max(
      0,
      Math.min(VIEW_ROWS - 1, Math.floor(((clientY - r.top) / r.height) * VIEW_ROWS)),
    );
    const pitch = pitches[row] ?? viewLow;
    const beat = windowBeat + col * GRID_BEAT;
    return { beat: snapBeat(beat), pitch };
  };

  return (
    <div className="p-2 sm:p-3">
      <div className="mb-2 flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={viewLow <= 24}
          onClick={() => onOctave(-1)}
          aria-label="表示音域を1オクターブ下げる"
        >
          <ChevronDown className="size-4" />
        </Button>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {midiToNoteName(viewLow)}–{midiToNoteName(viewLow + VIEW_ROWS - 1)}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={viewLow >= 96}
          onClick={() => onOctave(1)}
          aria-label="表示音域を1オクターブ上げる"
        >
          <ChevronUp className="size-4" />
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">グリッド 1/16</span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[40rem]">
          <div className="sticky left-0 z-10 w-10 shrink-0 border-r border-border bg-card">
            {pitches.map((p) => (
              <div
                key={p}
                className={cn(
                  "flex h-[18px] items-center justify-end pr-1 text-[9px] tabular-nums",
                  isBlackKey(p)
                    ? "bg-foreground/80 text-background"
                    : "bg-card text-muted-foreground",
                  p % 12 === 0 && "font-semibold text-foreground",
                )}
              >
                {p % 12 === 0 || p === cursorPitch ? midiToNoteName(p) : ""}
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            tabIndex={0}
            aria-label={`${track.name}の音符編集。矢印キーで移動、Enterで追加・削除、Spaceで再生。`}
            className="relative h-[432px] min-w-0 flex-1 cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              backgroundImage: [
                "linear-gradient(to right, color-mix(in oklab, var(--color-border) 80%, transparent) 1px, transparent 1px)",
                "linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 22%, transparent) 1px, transparent 1px)",
                "linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 70%, transparent) 1px, transparent 1px)",
              ].join(","),
              backgroundSize: `${100 / COLS}%, ${100 / 16}%, 100% ${100 / VIEW_ROWS}%`,
            }}
            onClick={(e) => {
              const cell = cellFromPoint(e.clientX, e.clientY);
              if (!cell) return;
              onCursor(cell.beat, cell.pitch);
              onToggle(cell.beat, cell.pitch);
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                onPlayToggle();
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                onToggle(cursorBeat, cursorPitch);
                return;
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                onCursor(Math.max(windowBeat, cursorBeat - GRID_BEAT), cursorPitch);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                onCursor(
                  Math.min(windowBeat + WINDOW_BEATS - GRID_BEAT, cursorBeat + GRID_BEAT),
                  cursorPitch,
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                onCursor(cursorBeat, Math.min(viewLow + VIEW_ROWS - 1, cursorPitch + 1));
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                onCursor(cursorBeat, Math.max(viewLow, cursorPitch - 1));
              } else if (e.key === "Home") {
                e.preventDefault();
                onSeekBeat(windowBeat);
              }
            }}
          >
            {pitches.map((p, row) =>
              isBlackKey(p) ? (
                <div
                  key={`bg-${p}`}
                  className="pointer-events-none absolute inset-x-0 bg-foreground/[0.04]"
                  style={{
                    top: `${(row / VIEW_ROWS) * 100}%`,
                    height: `${100 / VIEW_ROWS}%`,
                  }}
                />
              ) : null,
            )}

            {windowNotes.map((n) => {
              const start = secToBeat(n.start, bpm);
              const dur = Math.max(GRID_BEAT, secToBeat(n.duration, bpm));
              const left = ((start - windowBeat) / WINDOW_BEATS) * 100;
              const width = (dur / WINDOW_BEATS) * 100;
              const row = viewLow + VIEW_ROWS - 1 - n.midi;
              if (row < 0 || row >= VIEW_ROWS) return null;
              return (
                <button
                  key={n.id ?? `${n.start}-${n.midi}`}
                  type="button"
                  title={`${midiToNoteName(n.midi)} · クリックで削除`}
                  className="absolute z-[1] rounded-[3px] border border-white/30 shadow-sm"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(1.2, width)}%`,
                    top: `${(row / VIEW_ROWS) * 100}%`,
                    height: `${100 / VIEW_ROWS}%`,
                    background: track.color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(start, n.midi);
                  }}
                />
              );
            })}

            <div
              className="pointer-events-none absolute z-[2] rounded-sm ring-2 ring-primary"
              style={{
                left: `${((cursorBeat - windowBeat) / WINDOW_BEATS) * 100}%`,
                width: `${(GRID_BEAT / WINDOW_BEATS) * 100}%`,
                top: `${((viewLow + VIEW_ROWS - 1 - cursorPitch) / VIEW_ROWS) * 100}%`,
                height: `${100 / VIEW_ROWS}%`,
              }}
            />

            {playBeat != null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-primary"
                style={{
                  left: `${((playBeat - windowBeat) / WINDOW_BEATS) * 100}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {playing ? "再生中" : "READY"} · {midiToNoteName(cursorPitch)} · 拍{" "}
        {(cursorBeat + 1).toFixed(2)}
      </p>
    </div>
  );
}
