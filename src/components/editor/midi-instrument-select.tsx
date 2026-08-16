import { MIDI_INSTRUMENTS, type MidiInstrumentId } from "@/lib/audio/midi-instruments";
import { cn } from "@/lib/utils";

export function MidiInstrumentSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: MidiInstrumentId | undefined;
  onChange: (id: MidiInstrumentId) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block text-xs font-medium text-muted-foreground", className)}>
      楽器
      <select
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        value={value ?? "piano"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as MidiInstrumentId)}
      >
        {MIDI_INSTRUMENTS.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label} — {i.hint}
          </option>
        ))}
      </select>
    </label>
  );
}
