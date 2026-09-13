import { VOCAL_NOTE_CHOICES } from "@/lib/songdb/types";

export function SongVocalFields({
  vocalMinNote,
  vocalMaxNote,
  bpm,
  onChange,
}: {
  vocalMinNote: string;
  vocalMaxNote: string;
  bpm: number;
  onChange: (next: {
    vocalMinNote?: string;
    vocalMaxNote?: string;
    bpm?: number;
  }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:col-span-2">
      <label className="block text-[11px] font-medium text-muted-foreground">
        声域・最低
        <input
          list="fuwari-vocal-notes"
          value={vocalMinNote}
          onChange={(e) => onChange({ vocalMinNote: e.target.value })}
          placeholder="例: A3"
          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="block text-[11px] font-medium text-muted-foreground">
        声域・最高
        <input
          list="fuwari-vocal-notes"
          value={vocalMaxNote}
          onChange={(e) => onChange({ vocalMaxNote: e.target.value })}
          placeholder="例: C5"
          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="block text-[11px] font-medium text-muted-foreground">
        BPM
        <input
          type="number"
          min={20}
          max={400}
          inputMode="numeric"
          value={bpm > 0 ? bpm : ""}
          onChange={(e) =>
            onChange({ bpm: e.target.value === "" ? 0 : Number(e.target.value) })
          }
          placeholder="例: 96"
          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <datalist id="fuwari-vocal-notes">
        {VOCAL_NOTE_CHOICES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <p className="sm:col-span-3 text-[10px] leading-relaxed text-muted-foreground">
        メロディの声域です。原曲キーとは別に、歌い手が届く最低〜最高を残します。わからなければ空で大丈夫です。
      </p>
    </div>
  );
}
