import { useEffect } from "react";
import { Gamepad2, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import { midiToNoteName } from "@/lib/audio/pitch";
import { MidiInstrumentSelect } from "@/components/editor/midi-instrument-select";
import { cn } from "@/lib/utils";

export function TapRhythmPanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const setActiveTrack = useEditorStore((s) => s.setActiveTrack);
  const tapActive = useEditorStore((s) => s.tapActive);
  const tapPitches = useEditorStore((s) => s.tapPitches);
  const tapIndex = useEditorStore((s) => s.tapIndex);
  const tapHeld = useEditorStore((s) => s.tapHeld);
  const tapRecorded = useEditorStore((s) => s.tapRecorded);
  const startTapRhythm = useEditorStore((s) => s.startTapRhythm);
  const cancelTapRhythm = useEditorStore((s) => s.cancelTapRhythm);
  const finishTapRhythm = useEditorStore((s) => s.finishTapRhythm);
  const tapDown = useEditorStore((s) => s.tapDown);
  const tapUp = useEditorStore((s) => s.tapUp);
  const busy = useEditorStore((s) => s.isConvertingMidi);
  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const setTrackMidiInstrument = useEditorStore((s) => s.setTrackMidiInstrument);

  const active = tracks.find((t) => t.id === activeTrackId) ?? null;
  const hasScore = Boolean(active?.midiNotes?.length);
  const remaining = Math.max(0, tapPitches.length - tapIndex);
  const nextMidi = tapActive ? tapPitches[tapIndex] : undefined;
  const upcoming = tapActive ? tapPitches.slice(tapIndex, tapIndex + 6) : [];

  useEffect(() => {
    if (!tapActive) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== "Space") return;
      e.preventDefault();
      e.stopPropagation();
      tapDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      e.stopPropagation();
      tapUp();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [tapActive, tapDown, tapUp]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Gamepad2 className="size-4 text-primary" />
        タップでリズム
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        音程の順番はそのまま。画面またはスペースを叩いた瞬間にその音が鳴り、タイミングが譜面になります。
        伴奏に合わせるときは先に再生してから叩いてください。
      </p>

      {!tapActive ? (
        <>
          <label className="mb-3 block text-xs font-medium text-muted-foreground">
            音程譜（MIDI トラック）
            <select
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={activeTrackId ?? ""}
              onChange={(e) => setActiveTrack(e.target.value || null)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.kind === "midi" || t.midiNotes?.length
                    ? ` · ${t.midiNotes?.length ?? 0} 音`
                    : "（MIDIなし）"}
                </option>
              ))}
            </select>
          </label>
          <MidiInstrumentSelect
            className="mb-3"
            value={active?.midiInstrument ?? midiInstrument}
            disabled={busy}
            onChange={(id) => {
              setMidiInstrument(id);
              if (active?.id) void setTrackMidiInstrument(active.id, id);
            }}
          />
          <Button
            type="button"
            className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left"
            disabled={!hasScore || busy}
            onClick={() => startTapRhythm(active?.id)}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <CircleDot className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">タップ演奏を始める</span>
              <span className="block text-[11px] font-normal opacity-80">
                元の MIDI はミュートして、叩いた音だけ聞こえます
              </span>
            </span>
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <MidiInstrumentSelect
            value={active?.midiInstrument ?? midiInstrument}
            disabled={busy}
            onChange={(id) => {
              setMidiInstrument(id);
              if (active?.id) void setTrackMidiInstrument(active.id, id);
            }}
          />
          <div className="flex items-end justify-between text-[11px] text-muted-foreground">
            <span>
              {tapIndex} / {tapPitches.length} 音
            </span>
            <span>残り {remaining}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{
                width: `${tapPitches.length ? Math.round((tapIndex / tapPitches.length) * 100) : 0}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {upcoming.length === 0 ? (
              <span className="text-xs text-muted-foreground">譜面おわり</span>
            ) : (
              upcoming.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 font-semibold tabular-nums",
                    i === 0
                      ? "border-primary bg-primary text-primary-foreground text-base"
                      : "border-border bg-muted/50 text-xs text-muted-foreground",
                  )}
                >
                  {midiToNoteName(m)}
                </span>
              ))
            )}
          </div>

          <button
            type="button"
            className={cn(
              "flex min-h-[7.5rem] w-full touch-none flex-col items-center justify-center rounded-3xl border-2 text-lg font-semibold transition-[transform,background-color,border-color] duration-75 select-none",
              tapHeld
                ? "scale-[0.98] border-primary bg-primary text-primary-foreground"
                : "border-primary/40 bg-primary/10 text-foreground active:scale-[0.98]",
            )}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture(
                e.pointerId,
              );
              tapDown();
            }}
            onPointerUp={() => tapUp()}
            onPointerCancel={() => tapUp()}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">
              TAP
            </span>
            <span className="mt-1 text-2xl tabular-nums">
              {nextMidi != null ? midiToNoteName(nextMidi) : "完了"}
            </span>
            <span className="mt-1 text-[11px] font-normal opacity-70">
              押しているあいだが音の長さ
            </span>
          </button>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || tapRecorded.length === 0}
              onClick={() => void finishTapRhythm()}
            >
              記録してトラックに
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => cancelTapRhythm()}
            >
              やめる
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
