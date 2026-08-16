import { useCallback, useEffect, useState } from "react";
import { Drum } from "lucide-react";
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
import { cn, downloadBlob } from "@/lib/utils";
import { isYouTubePlayerReady, youtubeGetCurrentTime } from "@/lib/youtube-player";

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

function transportNow(opts: {
  status: string;
  tracks: { buffer: AudioBuffer | null }[];
  youtubeSync: boolean;
  youtubeVideoId: string | null;
  freeOriginMs: number | null;
}): number {
  const engine = getAudioEngine();
  if (opts.status === "playing" || opts.status === "recording") {
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
  if (opts.freeOriginMs == null) return 0;
  return (performance.now() - opts.freeOriginMs) / 1000;
}

export function RhythmPadPanel() {
  const [active, setActive] = useState(false);
  const [recorded, setRecorded] = useState<MidiNote[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  const [freeOriginMs, setFreeOriginMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

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

  const now = useCallback(() => {
    return transportNow({
      status,
      tracks,
      youtubeSync,
      youtubeVideoId,
      freeOriginMs,
    });
  }, [status, tracks, youtubeSync, youtubeVideoId, freeOriginMs]);

  const padUp = useCallback(() => {
    if (held == null) return;
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
      return next;
    });
    setHeld(null);
  }, [held, now]);

  const padDown = useCallback(
    (midi: number) => {
      if (!active) return;
      if (held != null) padUp();
      let origin = freeOriginMs;
      if (status !== "playing" && status !== "recording" && origin == null) {
        origin = performance.now();
        setFreeOriginMs(origin);
      }
      const t = transportNow({
        status,
        tracks,
        youtubeSync,
        youtubeVideoId,
        freeOriginMs: origin,
      });
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
      setRecorded((prev) => {
        const next = [...prev, note];
        setStatusMessage(`リズム ${next.length} 打`);
        return next;
      });
    },
    [
      active,
      held,
      padUp,
      freeOriginMs,
      status,
      tracks,
      youtubeSync,
      youtubeVideoId,
      midiInstrument,
      setStatusMessage,
    ],
  );

  useEffect(() => {
    if (!active) return;
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
  }, [active, padDown, padUp]);

  const start = () => {
    if (status === "recording") return;
    try {
      const engine = getAudioEngine();
      engine.tapNoteOff();
      engine.setTapInstrument(midiInstrument);
    } catch {
      /* noop */
    }
    setActive(true);
    setRecorded([]);
    setHeld(null);
    setFreeOriginMs(null);
    setStatusMessage(
      "リズム入力 — YouTube を流しながらパッドを叩けます。終わったら MIDI トラックに書き出します",
    );
  };

  const cancel = () => {
    if (held != null) {
      try {
        getAudioEngine().tapNoteOff();
      } catch {
        /* noop */
      }
    }
    setActive(false);
    setHeld(null);
    setFreeOriginMs(null);
    setStatusMessage("リズム入力をやめました");
  };

  const finish = async () => {
    let notes = recorded.slice();
    if (held != null && notes.length) {
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
    setActive(false);
    setHeld(null);
    setFreeOriginMs(null);
    setRecorded(notes);
    if (!notes.length) {
      setStatusMessage("リズムが記録されていません");
      return;
    }
    const t0 = Math.min(...notes.map((n) => n.start));
    const shifted =
      t0 > 0.05 && status !== "playing"
        ? notes.map((n) => ({ ...n, start: Math.max(0, n.start - t0) }))
        : notes;
    setBusy(true);
    setStatusMessage("リズムを MIDI トラックに書き出しています…");
    try {
      const name = "リズム · 入力";
      const parsed = notesToParsed(shifted, name);
      const engine = getAudioEngine();
      const buffer = await renderMidiToAudioBuffer(
        parsed,
        engine.getSampleRate(),
        midiInstrument,
      );
      const id = addTrack({ name, kind: "midi" });
      updateTrack(id, {
        buffer,
        midiNotes: shifted,
        midiSourceNotes: shifted,
        midiInstrument,
        kind: "midi",
      });
      engine.updateDuration(useEditorStore.getState().tracks);
      const midBytes = new Uint8Array(
        encodeMidiFile(shifted, {
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
        statusMessage: `リズムを MIDI にしました（${melodySummary(shifted)}）`,
      });
    } catch (e) {
      console.error(e);
      setStatusMessage(
        e instanceof Error ? e.message : "リズムの書き出しに失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Drum className="size-4 text-primary" />
        リズム入力
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        音階なし。パッドを叩いたタイミングだけで新規 MIDI を作ります。
        YouTube を再生したまま打ち込めるので、アレンジの下書きに使えます。
      </p>

      {!active ? (
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
            onClick={start}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Drum className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">リズム打ちを始める</span>
              <span className="block text-[11px] font-normal opacity-80">
                {youtubeVideoId
                  ? "YouTube を流しながらパッドで入力できます"
                  : "先に YouTube を読み込むと合わせやすいです"}
              </span>
            </span>
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <MidiInstrumentSelect
            value={midiInstrument}
            disabled={busy}
            onChange={setMidiInstrument}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {status === "playing" ? "再生に同期中" : "自由テンポ"} ·{" "}
              {recorded.length} 打
            </span>
            <span className="tabular-nums">キー 1〜4</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PADS.map((pad) => {
              const on = held === pad.midi;
              return (
                <button
                  key={pad.midi}
                  type="button"
                  className={cn(
                    "flex min-h-[4.5rem] touch-none flex-col items-center justify-center rounded-2xl border-2 select-none transition-[transform,background-color,border-color] duration-75",
                    on
                      ? "scale-[0.97] border-primary bg-primary text-primary-foreground"
                      : "border-primary/30 bg-primary/10 text-foreground active:scale-[0.97]",
                  )}
                  onPointerDown={(e) => {
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
            <Button
              type="button"
              disabled={busy || recorded.length === 0}
              onClick={() => void finish()}
            >
              MIDI トラックに
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={cancel}
            >
              やめる
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
