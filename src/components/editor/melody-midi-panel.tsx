import { Music2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditorStore } from "@/lib/store/editor-store";
import type { RhythmGrid } from "@/lib/audio/pitch-to-midi";
import { MidiInstrumentSelect } from "@/components/editor/midi-instrument-select";
import { cn } from "@/lib/utils";

const GRIDS: { id: RhythmGrid; label: string }[] = [
  { id: 4, label: "4分" },
  { id: 8, label: "8分" },
  { id: 16, label: "16分" },
  { id: 12, label: "3連" },
];

export function MelodyMidiPanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const setActiveTrack = useEditorStore((s) => s.setActiveTrack);
  const convertTrackToMidi = useEditorStore((s) => s.convertTrackToMidi);
  const applyRhythmToMidiTrack = useEditorStore((s) => s.applyRhythmToMidiTrack);
  const busy = useEditorStore((s) => s.isConvertingMidi);
  const progress = useEditorStore((s) => s.midiConvertProgress);
  const rhythmOnly = useEditorStore((s) => s.midiRhythmOnly);
  const setMidiRhythmOnly = useEditorStore((s) => s.setMidiRhythmOnly);
  const grid = useEditorStore((s) => s.midiGrid);
  const setMidiGrid = useEditorStore((s) => s.setMidiGrid);
  const snap = useEditorStore((s) => s.midiSnap);
  const setMidiSnap = useEditorStore((s) => s.setMidiSnap);
  const swing = useEditorStore((s) => s.midiSwing);
  const setMidiSwing = useEditorStore((s) => s.setMidiSwing);
  const bpm = useEditorStore((s) => s.bpm);
  const midiInstrument = useEditorStore((s) => s.midiInstrument);
  const setMidiInstrument = useEditorStore((s) => s.setMidiInstrument);
  const setTrackMidiInstrument = useEditorStore((s) => s.setTrackMidiInstrument);

  const active = tracks.find((t) => t.id === activeTrackId) ?? null;
  const canRun = Boolean(active?.buffer) && !busy;
  const hasMidi = Boolean(active?.midiNotes?.length);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">歌を MIDI に</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        音程を拾ってメロディにします。リズムだけ整えると、高さはそのまま拍に寄せます（BPM {bpm}）。
      </p>

      <label className="mb-3 block text-xs font-medium text-muted-foreground">
        対象トラック
        <select
          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={activeTrackId ?? ""}
          onChange={(e) => setActiveTrack(e.target.value || null)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.kind === "midi" || t.midiNotes?.length
                ? " · MIDI"
                : t.buffer
                  ? ""
                  : "（音源なし）"}
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
          if (active?.midiNotes?.length) {
            void setTrackMidiInstrument(active.id, id);
          }
        }}
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMidiRhythmOnly(false)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left transition-colors",
            !rhythmOnly
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="block text-xs font-semibold">歌ったまま</span>
          <span className="mt-0.5 block text-[10px] opacity-80">
            音程もリズムも原寸
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMidiRhythmOnly(true)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left transition-colors",
            rhythmOnly
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="block text-xs font-semibold">リズムだけ</span>
          <span className="mt-0.5 block text-[10px] opacity-80">
            高さは変えず拍に寄せる
          </span>
        </button>
      </div>

      {rhythmOnly && (
        <div className="mb-3 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {GRIDS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setMidiGrid(g.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  grid === g.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              寄せる強さ
              <span className="tabular-nums text-foreground">
                {Math.round(snap * 100)}%
              </span>
            </span>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[Math.round(snap * 100)]}
              onValueChange={([v]) => setMidiSnap((v ?? 85) / 100)}
            />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              スイング
              <span className="tabular-nums text-foreground">
                {Math.round(swing * 100)}%
              </span>
            </span>
            <Slider
              min={0}
              max={70}
              step={5}
              value={[Math.round(swing * 100)]}
              onValueChange={([v]) => setMidiSwing((v ?? 0) / 100)}
            />
          </label>
        </div>
      )}

      <div className="grid gap-2">
        <Button
          type="button"
          className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left"
          disabled={!canRun}
          onClick={() => void convertTrackToMidi(active?.id)}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Music2 className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium">
              {busy
                ? `変換中 ${Math.round(progress * 100)}%`
                : rhythmOnly
                  ? "MIDI 化してリズムを整える"
                  : "この歌を MIDI 化"}
            </span>
            <span className="block text-[11px] font-normal opacity-80">
              録音したボーカル向け
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
          disabled={!hasMidi || busy}
          onClick={() => void applyRhythmToMidiTrack(active?.id)}
        >
          <Timer className="size-4 text-primary" />
          <span>
            <span className="block text-sm font-medium">この MIDI のリズムだけ変える</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              音程は触らず、上のグリッドに寄せ直す
            </span>
          </span>
        </Button>
      </div>

      {busy && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </section>
  );
}
