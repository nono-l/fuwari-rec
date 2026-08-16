import { useEffect } from "react";
import { Drum } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import { MidiInstrumentSelect } from "@/components/editor/midi-instrument-select";
import { cn } from "@/lib/utils";

/** Fixed pads for rhythm entry — labels are hits, not scale degrees. */
const PADS: { midi: number; label: string; key: string; hint: string }[] = [
  { midi: 36, label: "ドン", key: "1", hint: "低" },
  { midi: 40, label: "タン", key: "2", hint: "中" },
  { midi: 44, label: "カン", key: "3", hint: "高" },
  { midi: 48, label: "チン", key: "4", hint: "頂" },
];

export function RhythmPadPanel() {
  const active = useEditorStore((s) => s.rhythmPadActive);
  const recorded = useEditorStore((s) => s.rhythmPadRecorded);
  const held = useEditorStore((s) => s.rhythmPadHeldMidi);
  const busy = useEditorStore((s) => s.isConvertingMidi);
  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const startRhythmPad = useEditorStore((s) => s.startRhythmPad);
  const cancelRhythmPad = useEditorStore((s) => s.cancelRhythmPad);
  const rhythmPadDown = useEditorStore((s) => s.rhythmPadDown);
  const rhythmPadUp = useEditorStore((s) => s.rhythmPadUp);
  const finishRhythmPad = useEditorStore((s) => s.finishRhythmPad);
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const status = useEditorStore((s) => s.status);

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const pad = PADS.find((p) => e.key === p.key);
      if (!pad) return;
      e.preventDefault();
      e.stopPropagation();
      rhythmPadDown(pad.midi);
    };
    const up = (e: KeyboardEvent) => {
      const pad = PADS.find((p) => e.key === p.key);
      if (!pad) return;
      e.preventDefault();
      e.stopPropagation();
      rhythmPadUp();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [active, rhythmPadDown, rhythmPadUp]);

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
            onClick={() => startRhythmPad()}
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
              {status === "playing" ? "再生に同期中" : "自由テンポ"} · {recorded.length} 打
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
                    rhythmPadDown(pad.midi);
                  }}
                  onPointerUp={() => rhythmPadUp()}
                  onPointerCancel={() => rhythmPadUp()}
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
              onClick={() => void finishRhythmPad()}
            >
              MIDI トラックに
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => cancelRhythmPad()}
            >
              やめる
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
