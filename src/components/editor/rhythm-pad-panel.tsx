import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Drum } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import { getAudioEngine } from "@/lib/audio/engine";
import { renderMidiToAudioBuffer, type MidiNote } from "@/lib/audio/midi";
import {
  encodeMidiFile,
  melodySummary,
  notesToParsed,
} from "@/lib/audio/pitch-to-midi";
import { MidiInstrumentSelect } from "@/components/editor/midi-instrument-select";
import { cn, downloadBlob, formatTime } from "@/lib/utils";
import {
  isYouTubePlayerReady,
  youtubeGetCurrentTime,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeSetMuted,
} from "@/lib/youtube-player";

/** Fixed pads for rhythm entry — labels are hits, not scale degrees. */
const PADS: { midi: number; label: string; key: string; hint: string }[] = [
  { midi: 36, label: "ドン", key: "1", hint: "低" },
  { midi: 40, label: "タン", key: "2", hint: "中" },
  { midi: 44, label: "カン", key: "3", hint: "高" },
  { midi: 48, label: "チン", key: "4", hint: "頂" },
];

function hasAudioBuffers(
  tracks: { buffer: AudioBuffer | null }[],
): boolean {
  return tracks.some((t) => !!t.buffer);
}

/** Live transport time (engine clock or YouTube when no local buffers). */
function transportNow(opts: {
  tracks: { buffer: AudioBuffer | null }[];
  youtubeSync: boolean;
  youtubeVideoId: string | null;
}): number {
  const engine = getAudioEngine();
  if (
    !hasAudioBuffers(opts.tracks) &&
    opts.youtubeSync &&
    opts.youtubeVideoId &&
    isYouTubePlayerReady()
  ) {
    return youtubeGetCurrentTime();
  }
  return engine.getCurrentTime();
}

export function RhythmPadPanel() {
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [recorded, setRecorded] = useState<MidiNote[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [clockLabel, setClockLabel] = useState(0);

  const recordedRef = useRef<MidiNote[]>([]);
  const heldRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const runningRef = useRef(false);
  const clockRaf = useRef(0);

  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const youtubeSync = useEditorStore((s) => s.youtubeSync);
  const status = useEditorStore((s) => s.status);
  const tracks = useEditorStore((s) => s.tracks);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);
  const addTrack = useEditorStore((s) => s.addTrack);
  const updateTrack = useEditorStore((s) => s.updateTrack);
  const bpm = useEditorStore((s) => s.bpm);
  const outputEnabled = useEditorStore((s) => s.outputEnabled);

  useEffect(() => {
    recordedRef.current = recorded;
  }, [recorded]);
  useEffect(() => {
    heldRef.current = held;
  }, [held]);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const stopClockPoll = useCallback(() => {
    if (clockRaf.current) {
      cancelAnimationFrame(clockRaf.current);
      clockRaf.current = 0;
    }
  }, []);

  const startClockPoll = useCallback(() => {
    stopClockPoll();
    const tick = () => {
      if (!runningRef.current) {
        clockRaf.current = 0;
        return;
      }
      const t = transportNow({
        tracks: useEditorStore.getState().tracks,
        youtubeSync: useEditorStore.getState().youtubeSync,
        youtubeVideoId: useEditorStore.getState().youtubeVideoId,
      });
      setClockLabel(t);
      useEditorStore.setState({
        currentTime: t,
        duration: Math.max(useEditorStore.getState().duration, t),
      });
      clockRaf.current = requestAnimationFrame(tick);
    };
    clockRaf.current = requestAnimationFrame(tick);
  }, [stopClockPoll]);

  useEffect(() => () => stopClockPoll(), [stopClockPoll]);

  // If the global transport leaves recording while we were running a session,
  // keep runningRef in sync (e.g. user hit 停止 on the top bar).
  useEffect(() => {
    if (!runningRef.current) return;
    if (status === "idle" && !getAudioEngine().isTransportOnly()) {
      // Mic record stopped from outside — finalize rhythm if any
      runningRef.current = false;
      setRunning(false);
      stopClockPoll();
    }
  }, [status, stopClockPoll]);

  const now = useCallback(() => {
    return transportNow({
      tracks: useEditorStore.getState().tracks,
      youtubeSync: useEditorStore.getState().youtubeSync,
      youtubeVideoId: useEditorStore.getState().youtubeVideoId,
    });
  }, []);

  const padUp = useCallback(() => {
    if (heldRef.current == null) return;
    const t = now();
    try {
      getAudioEngine().tapNoteOff();
    } catch {
      /* noop */
    }
    setRecorded((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice();
      const last = next[next.length - 1]!;
      next[next.length - 1] = {
        ...last,
        duration: Math.max(0.06, t - last.start),
      };
      recordedRef.current = next;
      return next;
    });
    setHeld(null);
    heldRef.current = null;
  }, [now]);

  const padDown = useCallback(
    (midi: number) => {
      if (!armedRef.current || !runningRef.current) return;
      if (heldRef.current != null) padUp();
      const t = now();
      const note: MidiNote = {
        midi,
        start: t,
        duration: 0.2,
        velocity: 0.82,
        channel: 0,
      };
      try {
        const engine = getAudioEngine();
        engine.setTapInstrument(midiInstrument);
        engine.tapNoteOn(midi, 0.82);
      } catch {
        /* noop */
      }
      setHeld(midi);
      heldRef.current = midi;
      setRecorded((prev) => {
        const next = [...prev, note];
        recordedRef.current = next;
        setStatusMessage(`リズム録音 ${next.length} 打 · ${formatTime(t)}`);
        return next;
      });
    },
    [padUp, now, midiInstrument, setStatusMessage],
  );

  useEffect(() => {
    if (!armed || !running) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const pad = PADS.find((p) => e.key === p.key);
      if (!pad) return;
      e.preventDefault();
      e.stopPropagation();
      padDown(pad.midi);
    };
    const up = (e: KeyboardEvent) => {
      const pad = PADS.find((p) => e.key === p.key);
      if (!pad) return;
      e.preventDefault();
      e.stopPropagation();
      padUp();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [armed, running, padDown, padUp]);

  const writeMidiTrack = useCallback(
    async (notesIn: MidiNote[]) => {
      let notes = notesIn.slice();
      if (heldRef.current != null && notes.length) {
        const t = now();
        const last = notes[notes.length - 1]!;
        notes[notes.length - 1] = {
          ...last,
          duration: Math.max(0.06, t - last.start),
        };
      }
      notes = notes.filter((n) => n.duration > 0.04);
      try {
        getAudioEngine().tapNoteOff();
      } catch {
        /* noop */
      }
      setHeld(null);
      heldRef.current = null;

      if (!notes.length) {
        setStatusMessage("リズムが記録されていません");
        return false;
      }

      setBusy(true);
      setStatusMessage("リズム譜面を MIDI トラックに書き出しています…");
      try {
        const name = `リズム · ${new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
        const parsed = notesToParsed(notes, name);
        const engine = getAudioEngine();
        const buffer = await renderMidiToAudioBuffer(
          parsed,
          engine.getSampleRate(),
          midiInstrument,
        );
        const id = addTrack({ name, kind: "midi" });
        updateTrack(id, {
          buffer,
          midiNotes: notes,
          midiSourceNotes: notes,
          midiInstrument,
          kind: "midi",
        });
        engine.updateDuration(useEditorStore.getState().tracks);
        const midBytes = new Uint8Array(
          encodeMidiFile(notes, {
            bpm,
            name,
            instrument: midiInstrument,
          }),
        );
        downloadBlob(
          new Blob([midBytes], { type: "audio/midi" }),
          "fuwari-rhythm.mid",
        );
        useEditorStore.setState({
          duration: engine.getDuration(),
          activeTrackId: id,
          statusMessage: `リズム譜面を MIDI にしました（${melodySummary(notes)}）`,
        });
        setRecorded([]);
        recordedRef.current = [];
        return true;
      } catch (e) {
        console.error(e);
        setStatusMessage(
          e instanceof Error ? e.message : "リズムの書き出しに失敗しました",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [now, midiInstrument, addTrack, updateTrack, bpm, setStatusMessage],
  );

  const startSession = async () => {
    if (runningRef.current) return;
    try {
      const engine = getAudioEngine();
      // Resume AudioContext on user gesture so the clock actually advances
      engine.getContext();
      engine.tapNoteOff();
      engine.setTapInstrument(midiInstrument);

      const state = useEditorStore.getState();
      engine.startTransportClock(state.tracks, "recording");

      if (state.youtubeSync && state.youtubeVideoId && isYouTubePlayerReady()) {
        youtubeSeek(engine.getCurrentTime());
        youtubeSetMuted(!outputEnabled);
        youtubePlay();
      }

      useEditorStore.setState({
        status: "recording",
        statusMessage:
          "リズム録音中 — 時間が進んでいます。パッド / キー1〜4 で打ち込み",
      });

      setArmed(true);
      armedRef.current = true;
      setRunning(true);
      runningRef.current = true;
      setRecorded([]);
      recordedRef.current = [];
      setHeld(null);
      heldRef.current = null;
      setClockLabel(engine.getCurrentTime());
      startClockPoll();
    } catch (e) {
      console.error(e);
      setStatusMessage(
        e instanceof Error ? e.message : "リズム録音を開始できませんでした",
      );
    }
  };

  const stopSession = async (commit: boolean) => {
    if (heldRef.current != null) padUp();
    const notes = recordedRef.current.slice();

    try {
      const engine = getAudioEngine();
      if (engine.isTransportOnly()) {
        engine.stopTransportClock();
      } else if (engine.getStatus() === "recording") {
        // Mic recording was active — leave stop to the global stopRecord path
        // but still freeze our session UI
      } else {
        engine.pause();
      }
    } catch {
      /* noop */
    }

    if (youtubeSync && youtubeVideoId) {
      try {
        youtubePause();
      } catch {
        /* noop */
      }
    }

    stopClockPoll();
    runningRef.current = false;
    setRunning(false);
    useEditorStore.setState({ status: "idle" });

    if (commit && notes.length > 0) {
      await writeMidiTrack(notes);
    } else if (commit) {
      setStatusMessage("リズムが記録されていません");
    } else {
      setStatusMessage("リズム録音を停止しました");
      setRecorded([]);
      recordedRef.current = [];
    }
  };

  const disarm = async () => {
    if (runningRef.current) {
      await stopSession(false);
    }
    setArmed(false);
    armedRef.current = false;
    setHeld(null);
    heldRef.current = null;
    setRecorded([]);
    recordedRef.current = [];
    setStatusMessage("リズム入力の準備を解除しました");
  };

  const canHit = running && !busy;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Drum className="size-4 text-primary" />
        リズム入力
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        開始すると時間が進みます（マイク不要）。パッドをリアルタイムに叩いて MIDI
        リズム譜面を作り、停止でトラック化します。YouTube
        同期中なら伴奏に合わせられます。
      </p>

      {!armed ? (
        <>
          <MidiInstrumentSelect
            className="mb-3"
            value={midiInstrument}
            disabled={busy}
            onChange={setMidiInstrument}
          />
          <Button
            type="button"
            className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left"
            disabled={busy}
            onClick={() => void startSession()}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
              <Circle className="size-4 fill-current" />
            </span>
            <span>
              <span className="block text-sm font-medium">
                リズム録音を開始
              </span>
              <span className="block text-[11px] font-normal opacity-80">
                {youtubeVideoId
                  ? "時間進行 + YouTube 再生に合わせてパッド入力"
                  : "時間が進み始めたらパッドで打ち込み → 停止で MIDI 化"}
              </span>
            </span>
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <MidiInstrumentSelect
            value={midiInstrument}
            disabled={busy || running}
            onChange={setMidiInstrument}
          />

          <div
            className={cn(
              "flex items-center justify-between rounded-xl px-3 py-2 text-[11px]",
              running
                ? "bg-danger/10 text-danger"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span className="font-semibold tabular-nums">
              {running
                ? `REC ${formatTime(clockLabel)} · ${recorded.length} 打`
                : `待機 · ${recorded.length} 打`}
            </span>
            <span className="tabular-nums opacity-80">キー 1〜4</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PADS.map((pad) => {
              const on = held === pad.midi;
              return (
                <button
                  key={pad.midi}
                  type="button"
                  disabled={!canHit}
                  className={cn(
                    "flex min-h-[4.5rem] touch-none flex-col items-center justify-center rounded-2xl border-2 select-none transition-[transform,background-color,border-color,opacity] duration-75",
                    !canHit && "cursor-not-allowed opacity-45",
                    on
                      ? "scale-[0.97] border-primary bg-primary text-primary-foreground"
                      : canHit
                        ? "border-primary/30 bg-primary/10 text-foreground active:scale-[0.97]"
                        : "border-border bg-muted/40 text-muted-foreground",
                  )}
                  onPointerDown={(e) => {
                    if (!canHit) return;
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(
                      e.pointerId,
                    );
                    padDown(pad.midi);
                  }}
                  onPointerUp={() => padUp()}
                  onPointerCancel={() => padUp()}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
                    {pad.hint} · {pad.key}
                  </span>
                  <span className="mt-0.5 text-lg font-semibold">{pad.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {!running ? (
              <Button
                type="button"
                variant="record"
                disabled={busy}
                onClick={() => void startSession()}
              >
                <Circle className="size-3.5 fill-current" />
                録音開始
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                className="animate-pulse"
                onClick={() => void stopSession(true)}
              >
                <Circle className="size-3.5 fill-current" />
                停止 → MIDI
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void disarm()}
            >
              やめる
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            マイクは使いません。開始で時計が動き、停止で打った譜面が MIDI
            トラックになります。
          </p>
        </div>
      )}
    </section>
  );
}
