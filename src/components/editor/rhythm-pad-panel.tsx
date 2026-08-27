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

function safeTime(t: number): number {
  if (!Number.isFinite(t) || t < 0) return 0;
  return t;
}

/** Live transport time (engine clock or YouTube when no local buffers). */
function transportNow(): number {
  const state = useEditorStore.getState();
  const engine = getAudioEngine();
  if (
    !hasAudioBuffers(state.tracks) &&
    state.youtubeSync &&
    state.youtubeVideoId &&
    isYouTubePlayerReady()
  ) {
    return safeTime(youtubeGetCurrentTime());
  }
  return safeTime(engine.getCurrentTime());
}

function finalizeNotes(
  raw: MidiNote[],
  heldMidi: number | null,
  endTime: number,
): MidiNote[] {
  let notes = raw.map((n) => ({
    ...n,
    start: safeTime(n.start),
    duration: Number.isFinite(n.duration) && n.duration > 0 ? n.duration : 0.15,
    velocity: Number.isFinite(n.velocity) ? n.velocity : 0.82,
    channel: 0,
  }));

  if (heldMidi != null && notes.length > 0) {
    const last = notes[notes.length - 1]!;
    notes[notes.length - 1] = {
      ...last,
      duration: Math.max(0.08, endTime - last.start),
    };
  }

  notes = notes
    .filter(
      (n) =>
        Number.isFinite(n.midi) &&
        n.duration >= 0.04 &&
        Number.isFinite(n.start),
    )
    .sort((a, b) => a.start - b.start);

  return notes;
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
  const committingRef = useRef(false);
  const clockRaf = useRef(0);

  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const youtubeSync = useEditorStore((s) => s.youtubeSync);
  const status = useEditorStore((s) => s.status);
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
      const t = transportNow();
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

  const writeMidiTrack = useCallback(
    async (rawNotes: MidiNote[], heldMidi: number | null) => {
      if (committingRef.current) return false;
      committingRef.current = true;

      const endTime = transportNow();
      const notes = finalizeNotes(rawNotes, heldMidi, endTime);

      try {
        getAudioEngine().tapNoteOff();
      } catch {
        /* noop */
      }
      setHeld(null);
      heldRef.current = null;

      if (!notes.length) {
        setStatusMessage("リズムが記録されていません（パッドを叩いてから停止）");
        committingRef.current = false;
        return false;
      }

      setBusy(true);
      setStatusMessage(`リズム ${notes.length} 打を MIDI トラックに追加中…`);

      const name = `リズム · ${new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;

      // 先にトラック枠を作る（波形生成が失敗しても譜面は残す）
      const id = addTrack({ name, kind: "midi" });
      updateTrack(id, {
        midiNotes: notes,
        midiSourceNotes: notes,
        midiInstrument,
        kind: "midi",
      });

      try {
        const parsed = notesToParsed(notes, name);
        // duration が壊れていると Offline が落ちるので保険
        if (!Number.isFinite(parsed.duration) || parsed.duration <= 0) {
          parsed.duration =
            Math.max(...notes.map((n) => n.start + n.duration), 0.3) + 0.2;
        }
        const engine = getAudioEngine();
        const buffer = await renderMidiToAudioBuffer(
          parsed,
          engine.getSampleRate(),
          midiInstrument,
        );
        updateTrack(id, {
          buffer,
          midiNotes: notes,
          midiSourceNotes: notes,
          midiInstrument,
          kind: "midi",
        });
        engine.updateDuration(useEditorStore.getState().tracks);

        try {
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
        } catch {
          /* download は任意 */
        }

        useEditorStore.setState({
          duration: engine.getDuration(),
          activeTrackId: id,
          statusMessage: `リズムをトラックに追加しました（${melodySummary(notes)}）`,
        });
        setRecorded([]);
        recordedRef.current = [];
        return true;
      } catch (e) {
        console.error(e);
        // トラック枠は残っている
        useEditorStore.setState({
          activeTrackId: id,
          statusMessage:
            e instanceof Error
              ? `トラックは追加済み（波形生成エラー: ${e.message}）`
              : "トラックは追加済み（波形生成に失敗）",
        });
        return true;
      } finally {
        setBusy(false);
        committingRef.current = false;
      }
    },
    [midiInstrument, addTrack, updateTrack, bpm, setStatusMessage],
  );

  const haltTransport = useCallback(() => {
    try {
      const engine = getAudioEngine();
      if (engine.isTransportOnly() || engine.getStatus() === "recording") {
        if (engine.isTransportOnly()) engine.stopTransportClock();
        else if (!engine.isTransportOnly() && engine.getStatus() === "recording") {
          // mic recording owned elsewhere — just mark idle for rhythm UI
        } else {
          engine.pause();
        }
      } else if (engine.getStatus() === "playing") {
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
  }, [youtubeSync, youtubeVideoId, stopClockPoll]);

  const stopSession = useCallback(
    async (commit: boolean) => {
      if (!runningRef.current && !commit) {
        haltTransport();
        return;
      }

      const heldMidi = heldRef.current;
      const raw = recordedRef.current.slice();

      // 先に時計を止めてから書き出す
      haltTransport();

      if (commit) {
        const ok = await writeMidiTrack(raw, heldMidi);
        if (ok) {
          setArmed(false);
          armedRef.current = false;
        }
      } else {
        try {
          getAudioEngine().tapNoteOff();
        } catch {
          /* noop */
        }
        setHeld(null);
        heldRef.current = null;
        setRecorded([]);
        recordedRef.current = [];
        setStatusMessage("リズム録音をやめました");
      }
    },
    [haltTransport, writeMidiTrack, setStatusMessage],
  );

  // 上部の停止などで status が idle になったときも、打った譜面を捨てない
  useEffect(() => {
    if (!runningRef.current) return;
    if (status !== "idle") return;
    if (committingRef.current) return;
    // 外部停止: ノートがあれば自動コミット
    const raw = recordedRef.current.slice();
    const heldMidi = heldRef.current;
    runningRef.current = false;
    setRunning(false);
    stopClockPoll();
    if (raw.length > 0) {
      void writeMidiTrack(raw, heldMidi).then((ok) => {
        if (ok) {
          setArmed(false);
          armedRef.current = false;
        }
      });
    }
  }, [status, stopClockPoll, writeMidiTrack]);

  const padUp = useCallback(() => {
    if (heldRef.current == null) return;
    const t = transportNow();
    try {
      getAudioEngine().tapNoteOff();
    } catch {
      /* noop */
    }
    const prev = recordedRef.current;
    if (prev.length) {
      const next = prev.slice();
      const last = next[next.length - 1]!;
      next[next.length - 1] = {
        ...last,
        duration: Math.max(0.08, t - last.start),
      };
      recordedRef.current = next;
      setRecorded(next);
    }
    setHeld(null);
    heldRef.current = null;
  }, []);

  const padDown = useCallback(
    (midi: number) => {
      if (!armedRef.current || !runningRef.current) return;
      if (heldRef.current != null) padUp();
      const t = transportNow();
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
      const next = [...recordedRef.current, note];
      recordedRef.current = next;
      setRecorded(next);
      setStatusMessage(`リズム録音 ${next.length} 打 · ${formatTime(t)}`);
    },
    [padUp, midiInstrument, setStatusMessage],
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

  const startSession = async () => {
    if (runningRef.current || committingRef.current) return;
    try {
      const engine = getAudioEngine();
      // ユーザー操作内で AudioContext を確実に起こす
      const ctx = engine.getContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      engine.tapNoteOff();
      engine.setTapInstrument(midiInstrument);

      const state = useEditorStore.getState();
      engine.startTransportClock(state.tracks, "recording");

      if (state.youtubeSync && state.youtubeVideoId && isYouTubePlayerReady()) {
        youtubeSeek(safeTime(engine.getCurrentTime()));
        youtubeSetMuted(!outputEnabled || useEditorStore.getState().youtubeMuteForCancel);
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
      setClockLabel(safeTime(engine.getCurrentTime()));
      startClockPoll();
    } catch (e) {
      console.error(e);
      setStatusMessage(
        e instanceof Error ? e.message : "リズム録音を開始できませんでした",
      );
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
        リズム譜面を作り、停止でトラックに追加します。
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
                  ? "時間進行 + YouTube に合わせてパッド入力"
                  : "時間が進んだらパッドで打ち込み → 停止でトラック追加"}
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
                    try {
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(
                        e.pointerId,
                      );
                    } catch {
                      /* noop */
                    }
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
                停止 → トラック追加
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
            打数（〇 打）が増えていることを確認してから停止してください。停止すると左のトラック一覧に追加されます。
          </p>
        </div>
      )}
    </section>
  );
}
