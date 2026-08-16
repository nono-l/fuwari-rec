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

/** Transport time while recording (engine or YouTube-synced). */
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
  const [recorded, setRecorded] = useState<MidiNote[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const prevStatus = useRef<string>("idle");
  const recordedRef = useRef<MidiNote[]>([]);
  const heldRef = useRef<number | null>(null);
  const armedRef = useRef(false);

  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const youtubeSync = useEditorStore((s) => s.youtubeSync);
  const status = useEditorStore((s) => s.status);
  const currentTime = useEditorStore((s) => s.currentTime);
  const tracks = useEditorStore((s) => s.tracks);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);
  const addTrack = useEditorStore((s) => s.addTrack);
  const updateTrack = useEditorStore((s) => s.updateTrack);
  const bpm = useEditorStore((s) => s.bpm);
  const startRecord = useEditorStore((s) => s.startRecord);
  const stopRecord = useEditorStore((s) => s.stopRecord);
  const inputEnabled = useEditorStore((s) => s.inputEnabled);

  const recording = status === "recording";

  useEffect(() => {
    recordedRef.current = recorded;
  }, [recorded]);
  useEffect(() => {
    heldRef.current = held;
  }, [held]);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  const now = useCallback(() => {
    return transportNow({
      tracks,
      youtubeSync,
      youtubeVideoId,
    });
  }, [tracks, youtubeSync, youtubeVideoId]);

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
      if (!armedRef.current) return;
      if (useEditorStore.getState().status !== "recording") return;
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
    if (!armed) return;
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
  }, [armed, padDown, padUp]);

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
    [
      now,
      midiInstrument,
      addTrack,
      updateTrack,
      bpm,
      setStatusMessage,
    ],
  );

  // When transport leaves recording while armed, commit the live rhythm chart.
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (was === "recording" && status !== "recording" && armedRef.current) {
      const notes = recordedRef.current;
      if (notes.length > 0) {
        void writeMidiTrack(notes);
      }
    }
  }, [status, writeMidiTrack]);

  const armAndRecord = async () => {
    if (recording) return;
    try {
      const engine = getAudioEngine();
      engine.tapNoteOff();
      engine.setTapInstrument(midiInstrument);
    } catch {
      /* noop */
    }
    setArmed(true);
    armedRef.current = true;
    setRecorded([]);
    recordedRef.current = [];
    setHeld(null);
    heldRef.current = null;
    setStatusMessage(
      "リズム録音準備 — 録音を開始するとパッドでリアルタイムに譜面を打てます",
    );
    await startRecord();
    if (useEditorStore.getState().status === "recording") {
      setStatusMessage(
        "リズム録音中 — パッド / キー1〜4 で打ち込み。録音停止で MIDI 譜面になります",
      );
    } else {
      setStatusMessage(
        inputEnabled
          ? "録音を開始できませんでした。マイク許可を確認してください。準備は維持しています"
          : "入力がオフです。入力をオンにしてから録音を開始してください（準備は維持）",
      );
    }
  };

  const stopAndCommit = async () => {
    if (recording) {
      await stopRecord();
      // writeMidiTrack is triggered by the status transition effect
      return;
    }
    if (recorded.length > 0) {
      await writeMidiTrack(recorded);
    }
  };

  const disarm = () => {
    if (held != null) {
      try {
        getAudioEngine().tapNoteOff();
      } catch {
        /* noop */
      }
    }
    setArmed(false);
    armedRef.current = false;
    setHeld(null);
    heldRef.current = null;
    setRecorded([]);
    recordedRef.current = [];
    setStatusMessage("リズム入力の準備を解除しました");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Drum className="size-4 text-primary" />
        リズム入力
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        録音を開始してから、パッドをリアルタイムに叩いて MIDI リズム譜面を作ります。
        YouTube 同期中なら伴奏に合わせたタイミングで記録されます。録音停止でトラック化します。
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
            onClick={() => void armAndRecord()}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
              <Circle className="size-4 fill-current" />
            </span>
            <span>
              <span className="block text-sm font-medium">
                録音してリズム打ちを始める
              </span>
              <span className="block text-[11px] font-normal opacity-80">
                {youtubeVideoId
                  ? "録音開始と同時にパッドが有効になります（YouTube 同期可）"
                  : "録音開始 → パッドでリアルタイム入力 → 停止で MIDI 化"}
              </span>
            </span>
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <MidiInstrumentSelect
            value={midiInstrument}
            disabled={busy || recording}
            onChange={setMidiInstrument}
          />

          <div
            className={cn(
              "flex items-center justify-between rounded-xl px-3 py-2 text-[11px]",
              recording
                ? "bg-danger/10 text-danger"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span className="font-semibold">
              {recording
                ? `REC ${formatTime(currentTime)} · ${recorded.length} 打`
                : `待機中 · ${recorded.length} 打（上の録音でも開始できます）`}
            </span>
            <span className="tabular-nums opacity-80">キー 1〜4</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PADS.map((pad) => {
              const on = held === pad.midi;
              const canHit = recording && !busy;
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
            {!recording ? (
              <Button
                type="button"
                variant="record"
                disabled={busy}
                onClick={() => void armAndRecord()}
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
                onClick={() => void stopAndCommit()}
              >
                <Circle className="size-3.5 fill-current" />
                録音停止 → MIDI
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy || recording}
              onClick={disarm}
            >
              準備を解除
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            上部の赤い「録音」ボタンでも同じ録音を開始・停止できます。停止したタイミングで打った譜面が MIDI トラックになります。
          </p>
        </div>
      )}
    </section>
  );
}
